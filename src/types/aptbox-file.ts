export type AptBoxFile = {
  id: string
  name: string
  type: string
  size: number

  visibility: "public" | "private" | "licensed"

  storageProvider: "Shelby"

  verified: boolean

  storyRegistered: boolean

  monetized: boolean

  aiTrainingAllowed: boolean

  royaltyEnabled: boolean

  expiresAt?: string

  revenueGenerated?: number

  licenseType?: string

  creatorWallet?: string

  ipId?: string
}