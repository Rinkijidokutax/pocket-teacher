import { defineConfig, devices } from "@playwright/test";

// Mobile-first PWA — test as an Android Chrome student on a phone.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "off",
    ...devices["Pixel 7"],
  },
});
