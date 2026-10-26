import { listNeighborhoods } from "../../../lib/community-server";
import { json, failure } from "../../../lib/server";
export async function GET() {
  try {
    return json(await listNeighborhoods());
  } catch (error) {
    return failure(error);
  }
}
