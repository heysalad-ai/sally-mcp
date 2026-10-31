import { test, expect } from "@playwright/test";
test("verified retailer image hosts load without becoming product-link destinations", async ({
  page,
}) => {
  const origins = [
    "https://www.ocado.com",
    "https://digitalcontent.api.tesco.com",
    "https://ecom-su-static-prod.wtrecom.com",
    "https://asdagroceries.scene7.com",
  ];
  for (const origin of origins) {
    await page.route(origin + "/sally-image-test.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ed4c4c"/></svg>',
      }),
    );
  }
  await page.goto("http://127.0.0.1:8789");
  await page.evaluate(
    (origins) =>
      window.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: {
            structuredContent: {
              retailer: "ocado",
              matches: origins.map((origin, index) => ({
                item: "milk",
                product: {
                  name: "Image test " + index,
                  pack_size: "1l",
                  price: 1,
                  confidence: 0.9,
                  url: origin + "/sally-image-test.svg",
                  image_url: origin + "/sally-image-test.svg",
                },
                notes: [],
              })),
            },
          },
        },
        "*",
      ),
    origins,
  );
  await expect(page.locator("img")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  for (const origin of origins.slice(1))
    await expect(page.locator('a[href^="' + origin + '"]')).toHaveCount(0);
});

test("failed images and lookalike image domains get safe placeholders", async ({
  page,
}) => {
  await page.route(
    "https://ecom-su-static-prod.wtrecom.com/sally-missing.png",
    (route) => route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("http://127.0.0.1:8789");
  await page.evaluate(() =>
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            retailer: "waitrose",
            matches: [
              "https://ecom-su-static-prod.wtrecom.com/sally-missing.png",
              "https://ecom-su-static-prod.wtrecom.com.attacker.example/pixel",
            ].map((image_url, index) => ({
              item: "milk",
              product: {
                name: "Fallback " + index,
                pack_size: "1l",
                price: 1,
                confidence: null,
                image_url,
              },
              notes: [],
            })),
          },
        },
      },
      "*",
    ),
  );
  await expect(
    page.getByText("Image unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No image", { exact: true })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
});

test("cards render product, price, size, confidence and amber note without overflow", async ({
  page,
}) => {
  await page.route("https://www.ocado.com/sally-test-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90"><rect x="22" y="15" width="36" height="60" rx="7" fill="#fff" stroke="#ed4c4c" stroke-width="3"/><rect x="27" y="8" width="26" height="12" rx="3" fill="#ed4c4c"/><path d="M22 40h36v20H22z" fill="#faa09a"/></svg>',
    }),
  );
  await page.goto("http://127.0.0.1:8789");
  await expect(
    page.getByRole("heading", { name: "Whole milk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sally by HeySalad®", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "HeySalad logo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("love your food", { exact: true })).toBeVisible();
  await expect(page.getByText("£1.80", { exact: true })).toBeVisible();
  await expect(page.getByText("96% confidence", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Check: Confirm pack size and number of packs before adding to your basket.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("You always check out and pay.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "submission/screenshots/products-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Whole milk", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "submission/screenshots/products-mobile.png",
    fullPage: true,
  });
});
test("host result messages render safely and foreign-frame messages are ignored", async ({
  page,
}) => {
  await page.route("https://www.ocado.com/sally-test-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90"><rect x="22" y="15" width="36" height="60" rx="7" fill="#fff" stroke="#ed4c4c" stroke-width="3"/><rect x="27" y="8" width="26" height="12" rx="3" fill="#ed4c4c"/><path d="M22 40h36v20H22z" fill="#faa09a"/></svg>',
    }),
  );
  await page.goto("http://127.0.0.1:8789");
  await page.evaluate(() =>
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            matches: [
              {
                item: "test",
                product: {
                  name: "<img src=x onerror=alert(1)>",
                  pack_size: "1 pack",
                  price: 2,
                  currency: "GBP",
                  confidence: null,
                  url: "javascript:alert(1)",
                  image_url: "https://attacker.example/pixel",
                },
                notes: [{ text: "<script>bad</script>" }],
              },
            ],
            retailer: "ocado",
          },
        },
      },
      "*",
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "<img src=x onerror=alert(1)>",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
  await expect(
    page.getByText("Confidence unavailable", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: null,
        origin: "https://attacker.example",
        data: {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: {
            isError: true,
            content: [{ type: "text", text: "ATTACK" }],
          },
        },
      }),
    ),
  );
  await expect(page.getByText("ATTACK", { exact: true })).toHaveCount(0);
});

test("recipe view distinguishes confirmed and unknown serving counts", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:8789");
  await page.evaluate(() =>
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            items: [{ name: "pasta", quantity: 400, unit: "g" }],
            requested_servings: 4,
            applied_servings: 4,
            notes: [],
          },
        },
      },
      "*",
    ),
  );
  await expect(
    page.getByText("Shopping list for 4 servings", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("400 g pasta", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            items: [{ name: "pasta", quantity: 200, unit: "g" }],
            requested_servings: 4,
            applied_servings: null,
            notes: [
              {
                style: "amber",
                text: "Sally has not confirmed the serving count. Confirm ingredient amounts before shopping.",
              },
            ],
          },
        },
      },
      "*",
    ),
  );
  await expect(
    page.getByText("Shopping list — confirm serving quantities", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Shopping list for 4 servings", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Check: Sally has not confirmed/)).toBeVisible();
});
