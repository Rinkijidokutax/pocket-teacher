import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ensure the teacher's markdown brain is bundled into the chat serverless function
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/teacher.md"],
  },
};

export default nextConfig;
