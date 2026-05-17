import { redirect } from "next/navigation";

/**
 * Legacy /explore route — preserved as a permanent redirect to /marketplace
 * so any externally-shared links keep working.
 */
export default function ExploreRedirect() {
  redirect("/marketplace");
}
