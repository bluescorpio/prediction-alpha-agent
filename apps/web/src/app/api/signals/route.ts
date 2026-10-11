import { readIntelCards, readSignals } from "../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const [signals, intelCards] = await Promise.all([readSignals(), readIntelCards()]);
  return Response.json({ signals, intelCards });
}
