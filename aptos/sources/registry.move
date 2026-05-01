/// aptbox file registry
///
/// Records every uploaded file with cryptographic provenance and gates access
/// via four modes: public, paid (one-time APT purchase), whitelist, token-gated.
///
/// Storage layout:
///   - One `Registry` resource at the module address holds the global file table
///     and a monotonically increasing `next_id`.
///   - Each file's metadata lives inline in `Registry.files` keyed by `file_id`.
///   - Paid access is tracked per-(buyer, file_id) in `AccessReceipts`.
module aptbox::registry {
    use std::error;
    use std::signer;
    use std::string::String;
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::event;
    use aptos_framework::table::{Self, Table};
    use aptos_framework::timestamp;

    // ---- Access modes ----
    const ACCESS_PUBLIC: u8 = 0;
    const ACCESS_PAID: u8 = 1;
    const ACCESS_WHITELIST: u8 = 2;
    // ACCESS_TOKEN_GATED reserved for future use
    const ACCESS_TOKEN_GATED: u8 = 3;

    // ---- Errors ----
    const E_NOT_PUBLISHED: u64 = 1;
    const E_FILE_NOT_FOUND: u64 = 2;
    const E_NOT_OWNER: u64 = 3;
    const E_INVALID_ACCESS_TYPE: u64 = 4;
    const E_NOT_PAID_FILE: u64 = 5;
    const E_ALREADY_INITIALIZED: u64 = 6;

    // ---- Resources ----

    struct FileRecord has store, drop, copy {
        file_id: u64,
        uploader: address,
        // SHA-256 of the original file (32 bytes)
        content_hash: vector<u8>,
        // Shelby blob name / CID
        shelby_cid: String,
        // MIME type (e.g. "video/mp4", "image/png")
        mime_type: String,
        // Original file size in bytes
        size_bytes: u64,
        access_type: u8,
        // Price in octas (1 APT = 100_000_000 octas). 0 if not paid.
        price_octas: u64,
        // Whitelist for ACCESS_WHITELIST mode
        whitelist: vector<address>,
        flag_count: u64,
        created_at: u64,
    }

    struct Registry has key {
        next_id: u64,
        files: Table<u64, FileRecord>,
        // (buyer_addr, file_id) -> bought_at_timestamp
        receipts: Table<address, Table<u64, u64>>,
    }

    // ---- Events ----

    #[event]
    struct FileRegistered has drop, store {
        file_id: u64,
        uploader: address,
        shelby_cid: String,
        access_type: u8,
        price_octas: u64,
    }

    #[event]
    struct AccessPurchased has drop, store {
        file_id: u64,
        buyer: address,
        price_octas: u64,
    }

    #[event]
    struct FileFlagged has drop, store {
        file_id: u64,
        reporter: address,
        new_flag_count: u64,
    }

    #[event]
    struct FileDeleted has drop, store {
        file_id: u64,
        uploader: address,
        shelby_cid: String,
    }

    // ---- Init ----

    /// Called once by the module owner after publishing.
    public entry fun initialize(owner: &signer) {
        let owner_addr = signer::address_of(owner);
        assert!(owner_addr == @aptbox, error::permission_denied(E_NOT_OWNER));
        assert!(!exists<Registry>(@aptbox), error::already_exists(E_ALREADY_INITIALIZED));

        move_to(owner, Registry {
            next_id: 0,
            files: table::new(),
            receipts: table::new(),
        });
    }

    // ---- Entry: register a new file ----

    public entry fun register_file(
        uploader: &signer,
        content_hash: vector<u8>,
        shelby_cid: String,
        mime_type: String,
        size_bytes: u64,
        access_type: u8,
        price_octas: u64,
        whitelist: vector<address>,
    ) acquires Registry {
        assert!(exists<Registry>(@aptbox), error::not_found(E_NOT_PUBLISHED));
        assert!(access_type <= ACCESS_TOKEN_GATED, error::invalid_argument(E_INVALID_ACCESS_TYPE));

        let registry = borrow_global_mut<Registry>(@aptbox);
        let file_id = registry.next_id;
        registry.next_id = file_id + 1;

        let uploader_addr = signer::address_of(uploader);
        let record = FileRecord {
            file_id,
            uploader: uploader_addr,
            content_hash,
            shelby_cid,
            mime_type,
            size_bytes,
            access_type,
            price_octas,
            whitelist,
            flag_count: 0,
            created_at: timestamp::now_seconds(),
        };
        table::add(&mut registry.files, file_id, record);

        event::emit(FileRegistered {
            file_id,
            uploader: uploader_addr,
            shelby_cid,
            access_type,
            price_octas,
        });
    }

    // ---- Entry: purchase access to a paid file ----

    public entry fun purchase_access(
        buyer: &signer,
        file_id: u64,
    ) acquires Registry {
        assert!(exists<Registry>(@aptbox), error::not_found(E_NOT_PUBLISHED));
        let registry = borrow_global_mut<Registry>(@aptbox);
        assert!(table::contains(&registry.files, file_id), error::not_found(E_FILE_NOT_FOUND));

        let record = table::borrow(&registry.files, file_id);
        assert!(record.access_type == ACCESS_PAID, error::invalid_state(E_NOT_PAID_FILE));

        // Pay the uploader directly. Uses APT (octas).
        let buyer_addr = signer::address_of(buyer);
        aptos_account::transfer(buyer, record.uploader, record.price_octas);

        // Record the receipt: receipts[buyer][file_id] = timestamp
        if (!table::contains(&registry.receipts, buyer_addr)) {
            table::add(&mut registry.receipts, buyer_addr, table::new());
        };
        let buyer_receipts = table::borrow_mut(&mut registry.receipts, buyer_addr);
        if (!table::contains(buyer_receipts, file_id)) {
            table::add(buyer_receipts, file_id, timestamp::now_seconds());
        };

        event::emit(AccessPurchased {
            file_id,
            buyer: buyer_addr,
            price_octas: record.price_octas,
        });
    }

    // ---- Entry: delete a file (owner only) ----

    public entry fun delete_file(uploader: &signer, file_id: u64) acquires Registry {
        assert!(exists<Registry>(@aptbox), error::not_found(E_NOT_PUBLISHED));
        let registry = borrow_global_mut<Registry>(@aptbox);
        assert!(table::contains(&registry.files, file_id), error::not_found(E_FILE_NOT_FOUND));

        let uploader_addr = signer::address_of(uploader);
        let record_ref = table::borrow(&registry.files, file_id);
        assert!(record_ref.uploader == uploader_addr, error::permission_denied(E_NOT_OWNER));

        let removed = table::remove(&mut registry.files, file_id);

        event::emit(FileDeleted {
            file_id,
            uploader: uploader_addr,
            shelby_cid: removed.shelby_cid,
        });
    }

    // ---- Entry: flag a file for review ----

    public entry fun flag_file(reporter: &signer, file_id: u64) acquires Registry {
        assert!(exists<Registry>(@aptbox), error::not_found(E_NOT_PUBLISHED));
        let registry = borrow_global_mut<Registry>(@aptbox);
        assert!(table::contains(&registry.files, file_id), error::not_found(E_FILE_NOT_FOUND));

        let record = table::borrow_mut(&mut registry.files, file_id);
        record.flag_count = record.flag_count + 1;

        event::emit(FileFlagged {
            file_id,
            reporter: signer::address_of(reporter),
            new_flag_count: record.flag_count,
        });
    }

    // ---- Views ----

    #[view]
    public fun has_access(addr: address, file_id: u64): bool acquires Registry {
        if (!exists<Registry>(@aptbox)) return false;
        let registry = borrow_global<Registry>(@aptbox);
        if (!table::contains(&registry.files, file_id)) return false;

        let record = table::borrow(&registry.files, file_id);
        if (record.access_type == ACCESS_PUBLIC) return true;
        if (record.uploader == addr) return true;

        if (record.access_type == ACCESS_PAID) {
            if (!table::contains(&registry.receipts, addr)) return false;
            let buyer_receipts = table::borrow(&registry.receipts, addr);
            return table::contains(buyer_receipts, file_id)
        };

        if (record.access_type == ACCESS_WHITELIST) {
            return vector::contains(&record.whitelist, &addr)
        };

        // ACCESS_TOKEN_GATED handling reserved for future implementation
        false
    }

    #[view]
    public fun get_file(file_id: u64): FileRecord acquires Registry {
        let registry = borrow_global<Registry>(@aptbox);
        assert!(table::contains(&registry.files, file_id), error::not_found(E_FILE_NOT_FOUND));
        *table::borrow(&registry.files, file_id)
    }

    #[view]
    public fun next_id(): u64 acquires Registry {
        borrow_global<Registry>(@aptbox).next_id
    }
}
