export class BrightDataClient {
  private apiKey: string;
  private datasetId: string;
  private baseUrl = "https://api.brightdata.com/datasets/v3";

  constructor(apiKey?: string, datasetId?: string) {
    this.apiKey = apiKey || process.env.BRIGHTDATA_API_KEY || "";
    this.datasetId = datasetId || process.env.BRIGHTDATA_DATASET_ID || "gd_l1vikfch901nx3by4";
  }

  static chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  async trigger(urls: string[], webhookUrl?: string): Promise<{ snapshot_id: string }> {
    const url = `${this.baseUrl}/trigger?dataset_id=${this.datasetId}&include_errors=true${
      webhookUrl ? `&endpoint=${encodeURIComponent(webhookUrl)}` : ""
    }`;

    const payload = urls.map((u) => ({ url: u }));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Bright Data Trigger failed: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return { snapshot_id: data.snapshot_id };
  }

  async scrape(urls: string[]): Promise<{ status: "complete" | "running"; snapshot_id?: string; records?: any[] }> {
    const triggerRes = await this.trigger(urls);
    return {
      status: "running",
      snapshot_id: triggerRes.snapshot_id,
    };
  }

  async checkProgress(snapshot_id: string): Promise<{ status: "running" | "ready" | "failed" }> {
    const res = await fetch(`${this.baseUrl}/progress/${snapshot_id}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to check progress for snapshot ${snapshot_id}: ${res.statusText}`);
    }

    const data = await res.json();
    return { status: data.status };
  }

  async downloadSnapshot(snapshot_id: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/snapshot/${snapshot_id}?format=json`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download snapshot ${snapshot_id}: ${res.statusText}`);
    }

    return await res.json();
  }
}
