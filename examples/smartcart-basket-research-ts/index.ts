import { Solari } from "@solarisdk/browser"
import { SandboxClient } from "@solarisdk/sandbox"

const BASE = "https://exo-robotics.github.io/smartcart-solari/website/solari-demo/retailer-v4/product"
const REQUIRED_GRAMS = 680.388555 // SmartCart's reviewed 1.5 lb requirement.
const MAX_PREMIUM = 0.75
const candidates = [
  "dg4-chicken-value-3lb",
  "dg4-chicken-organic-1-5lb",
  "dg4-chicken-free-range-3lb",
].map((id) => ({ id, url: `${BASE}/${id}.html` }))

type Observation = {
  schemaVersion: "retailer-observation-v1"
  observationID: string
  retailerProductID: string
  sourceURL: string
  title: string
  packageQuantity: number
  packageUnit: "gram"
  visiblePrice: number
  currency: "USD"
  observedAt: string
  syntheticPrice: true
  collectionMethod: "solari-browser-controlled-demo"
}

type Decision = {
  schemaVersion: "basket-decision-v1"
  selectedObservationID: string
  packageCount: number
  lineTotal: number
  surplusGrams: number
  cheapestLineTotal: number
  premiumOverCheapest: number
}

const apiKey = process.env.SOLARI_API_KEY
if (!apiKey) throw new Error("Set SOLARI_API_KEY in your shell; never put it in source code.")

const browserClient = new Solari({ apiKey, timeoutMs: 15_000 })
let browser: Awaited<ReturnType<typeof browserClient.launch>> | undefined
let sandbox: Awaited<ReturnType<SandboxClient["create"]>> | undefined

try {
  // This fresh, logged-out Browser has no profile, proxy, stealth, account, cart, or checkout access.
  browser = await browserClient.launch({ stealth: false, recording: false, captcha: false, proxy: "off" })
  const observations: Observation[] = []

  for (const candidate of candidates) {
    const page = await browser.newPage()
    try {
      await page.goto(candidate.url, { waitUntil: "domcontentloaded", timeout: 15_000 })
      await page.waitForSelector('[data-solari-product="true"]', { timeout: 15_000 })
      if (new URL(page.url()).href !== new URL(candidate.url).href) throw new Error("Unexpected redirect")

      const observed = await page.locator('[data-solari-product="true"]').evaluate((node) => {
        const data = (node as HTMLElement).dataset
        return {
          id: data.productId,
          title: data.productName,
          packageValue: Number(data.packageValue),
          packageUnit: data.packageUnit,
          priceCents: Number(data.priceCents),
          currency: data.currency,
          syntheticPrice: data.syntheticPrice,
        }
      })
      if (observed.id !== candidate.id || observed.currency !== "USD" || observed.syntheticPrice !== "true") {
        throw new Error(`Evidence identity failed for ${candidate.id}`)
      }
      const gramsPerUnit = observed.packageUnit === "lb" ? 453.59237 : NaN
      if (!observed.title || observed.packageValue <= 0 || !Number.isFinite(gramsPerUnit * observed.packageValue)
        || !Number.isSafeInteger(observed.priceCents) || observed.priceCents < 0) {
        throw new Error(`Unsupported package evidence for ${candidate.id}`)
      }
      observations.push({
        schemaVersion: "retailer-observation-v1",
        observationID: `obs-${candidate.id}`,
        retailerProductID: candidate.id,
        sourceURL: candidate.url,
        title: observed.title,
        packageQuantity: observed.packageValue * gramsPerUnit,
        packageUnit: "gram",
        visiblePrice: observed.priceCents / 100,
        currency: "USD",
        observedAt: new Date().toISOString(),
        syntheticPrice: true,
        collectionMethod: "solari-browser-controlled-demo",
      })
    } finally {
      await page.close()
    }
  }

  const sandboxClient = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com", callTimeoutMs: 15_000 })
  sandbox = await sandboxClient.create({
    template: "base",
    timeoutMs: 15_000,
    lifecycle: { onTimeout: "kill", autoResume: false },
    metadata: { purpose: "smartcart-cookbook-owned-demo" },
  })
  const optimizer = String.raw`
import json, math, sys
p=json.loads(sys.argv[1]); required=p["requiredGrams"]
rows=[]
for o in p["observations"]:
  count=math.ceil(required/o["packageQuantity"]-1e-12)
  rows.append({"observationID":o["observationID"],"packageCount":count,
    "lineTotal":round(count*o["visiblePrice"],2),
    "surplusGrams":round(count*o["packageQuantity"]-required,6)})
cheapest=min(rows,key=lambda x:(x["lineTotal"],x["observationID"]))
eligible=[x for x in rows if x["lineTotal"]<=cheapest["lineTotal"]+p["maxPremium"]+1e-9]
chosen=min(eligible,key=lambda x:(x["surplusGrams"],x["lineTotal"],x["observationID"]))
print(json.dumps({"schemaVersion":"basket-decision-v1","selectedObservationID":chosen["observationID"],
 "packageCount":chosen["packageCount"],"lineTotal":chosen["lineTotal"],"surplusGrams":chosen["surplusGrams"],
 "cheapestLineTotal":cheapest["lineTotal"],"premiumOverCheapest":round(chosen["lineTotal"]-cheapest["lineTotal"],2)}))`
  const result = await sandbox.commands.run("python3", {
    args: ["-c", optimizer, JSON.stringify({ requiredGrams: REQUIRED_GRAMS, maxPremium: MAX_PREMIUM, observations })],
    timeoutMs: 15_000,
  })
  if (result.exitCode !== 0 || result.stderr.trim()) throw new Error(`Sandbox optimizer failed: ${result.stderr}`)
  const decision = JSON.parse(result.stdout) as Decision

  // The product verifies the remote decision before presenting it to a shopper.
  const selected = observations.find(({ observationID }) => observationID === decision.selectedObservationID)
  if (!selected) throw new Error("Sandbox selected evidence outside the admitted set")
  const expectedCount = Math.ceil(REQUIRED_GRAMS / selected.packageQuantity - 1e-12)
  const expectedTotal = Number((expectedCount * selected.visiblePrice).toFixed(2))
  const expectedSurplus = Number((expectedCount * selected.packageQuantity - REQUIRED_GRAMS).toFixed(6))
  const cheapestTotal = Math.min(...observations.map((observation) => {
    const count = Math.ceil(REQUIRED_GRAMS / observation.packageQuantity - 1e-12)
    return Number((count * observation.visiblePrice).toFixed(2))
  }))
  const expectedPremium = Number((expectedTotal - cheapestTotal).toFixed(2))
  if (decision.packageCount !== expectedCount || decision.lineTotal !== expectedTotal
    || decision.surplusGrams !== expectedSurplus || decision.cheapestLineTotal !== cheapestTotal
    || decision.premiumOverCheapest !== expectedPremium || expectedPremium < 0 || expectedPremium > MAX_PREMIUM) {
    throw new Error("Sandbox decision failed local coverage, price, or premium-cap verification")
  }

  console.log(JSON.stringify({ retailer: "SmartCart Demo Grocer (owned synthetic catalog)", observations, decision }, null, 2))
} finally {
  // Destroy the VM, release the Browser session, and close the Node client even after failure.
  const cleanup: Array<[string, () => Promise<unknown>]> = [
    ["sandbox", () => sandbox ? sandbox.kill() : Promise.resolve()],
    ["browser", () => browser ? browser.close() : Promise.resolve()],
    ["browser client", () => browserClient.close()],
  ]
  const failures: string[] = []
  for (const [name, close] of cleanup) {
    try { await close() } catch { failures.push(name) }
  }
  if (failures.length) throw new Error(`Solari cleanup failed for: ${failures.join(", ")}`)
}
