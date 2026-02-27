import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("analytics");

  if (req.method === "POST") {
    const raw = await store.get("visits");
    const newCount = (raw ? parseInt(raw) : 0) + 1;
    await store.set("visits", String(newCount));
    return Response.json({ count: newCount });
  }

  const raw = await store.get("visits");
  return Response.json({ count: raw ? parseInt(raw) : 0 });
};

export const config = { path: "/api/count" };
