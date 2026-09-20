import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "oficina",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/oficina.json",
      },
      testIgnore: [
        /auth\.setup\.ts/,
        /chofer\.spec\.ts/,
        /auth-routing\.spec\.ts/,
      ],
    },
    {
      name: "chofer",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        storageState: "tests/e2e/.auth/chofer1.json",
      },
      testMatch: /chofer\.spec\.ts/,
    },
    {
      name: "anonimo",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
      },
      testMatch: /auth-routing\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run build:test && npx vite preview --port 4173 --mode test",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
