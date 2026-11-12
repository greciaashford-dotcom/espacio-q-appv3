import { MongoClient } from "mongodb";
import { NextResponse } from "next/server";

const DB_DOWN_ERRORS = new Set(["MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError", "MongoTopologyClosedError"]);

async function mongoReachable(): Promise<boolean> {
  const url = process.env.MONGO_URL;
  if (!url) return false;
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 1500 });
  try {
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function dbUnavailable() {
  return NextResponse.json({ error: "Base de datos no disponible temporalmente." }, { status: 503 });
}

/** /api/*: si MongoDB no responde, 503 JSON sin traza (en lugar de un 500 genérico). */
export function withDbGuard<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const res = await handler(...args);
      if (res.status >= 500 && !(await mongoReachable())) return dbUnavailable();
      return res;
    } catch (err: any) {
      if (DB_DOWN_ERRORS.has(err?.name) || err?.code === "DB_CONFIG" || !(await mongoReachable())) {
        console.error("[api] MongoDB no disponible:", err?.message || err);
        return dbUnavailable();
      }
      throw err;
    }
  };
}
