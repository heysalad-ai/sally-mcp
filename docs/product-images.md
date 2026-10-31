# Product image origins

Checked against retailer pages on 15 October 2026. Candidate images are optional and caller supplied. The widget allows HTTPS retailer images plus these exact observed image hosts; it does not allow arbitrary CDN hosts or treat image hosts as product-link destinations.

| Retailer | Observed image origin                     | Source page                                                                                                                                                        |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ocado    | `https://www.ocado.com`                   | [British Semi Skimmed Milk](https://www.ocado.com/products/ocado-british-semi-skimmed-milk-2-pints/78922011)                                                       |
| Tesco    | `https://digitalcontent.api.tesco.com`    | [British Whole Milk](https://www.tesco.com/shop/en-GB/products/252207566)                                                                                          |
| Waitrose | `https://ecom-su-static-prod.wtrecom.com` | [Duchy Organic Whole Milk](https://www.waitrose.com/ecom/products/duchy-organic-unhomogenised-whole-milk-1-pint/015864-7587-7588)                                  |
| Asda     | `https://asdagroceries.scene7.com`        | [British Whole Milk](https://www.asda.com/groceries/product/whole-milk/asda-british-whole-milk-2-pints-1136ml/538239), which references this host for image assets |

The MCP Apps resource CSP advertises the same exact image origins. Product links are restricted to the known retailer storefront hosts. A new image origin requires adding the exact origin to both the image URL check and host CSP. External images use no-referrer and failed loads become an “Image unavailable” placeholder. Unapproved images become a “No image” placeholder. New hosts should be verified from retailer source before adding them.

Browser regressions use intercepted fixture images on these origins; they prove the URL boundary, rendering and failure behavior, not continued availability of a retailer's image server. Actual ChatGPT-host rendering remains a separate release gate.
