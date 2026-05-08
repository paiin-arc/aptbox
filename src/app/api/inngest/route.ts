import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processFile, reprocessFile } from "@/inngest/functions/processFile";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processFile, reprocessFile],
});
