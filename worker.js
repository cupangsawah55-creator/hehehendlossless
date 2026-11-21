import { createBitChordAuth } from "./bitchord-addon-auth.mjs";

const auth = createBitChordAuth({
  hosts: ["hehehendlossless.cupangsawah55.workers.dev"]
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function getJamendoTracks(params, env) {
  if (!env.JAMENDO_CLIENT_ID) {
    throw new Error("JAMENDO_CLIENT_ID belum dikonfigurasi");
  }

  const api = new URL("https://api.jamendo.com/v3.0/tracks/");

  api.searchParams.set("client_id", env.JAMENDO_CLIENT_ID);
  api.searchParams.set("format", "json");
  api.searchParams.set("limit", "25");
  api.searchParams.set("audioformat", "flac");
  api.searchParams.set("imagesize", "300");

  for (const [key, value] of Object.entries(params)) {
    api.searchParams.set(key, value);
  }

  const response = await fetch(api.toString());

  if (!response.ok) {
    throw new Error("Jamendo API gagal merespons");
  }

  const data = await response.json();

  if (data.headers?.status !== "success") {
    throw new Error("Jamendo API mengembalikan error");
  }

  return data.results || [];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.json" && request.method === "GET") {
      return json({
        id: "com.cupangsawah55.hehehendlossless",
        name: "HEHEHEND LOSSLESS",
        version: "2.1.0",
        resources: ["search", "stream"],
        bitchordAuth: true
      });
    }

    if (url.pathname === "/__health" && request.method === "GET") {
      return json({
        addon: "HEHEHEND LOSSLESS",
        version: "2.1.0",
        worker: "online"
      });
    }

    if (url.pathname === "/__auth-check") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405);
      }

      const denied = await auth.guard(request);
      if (denied) return denied;

      return json({
        authenticated: true,
        addon: "HEHEHEND LOSSLESS"
      });
    }

    if (url.pathname === "/search") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405);
      }

      const denied = await auth.guard(request);
      if (denied) return denied;

      const query = url.searchParams.get("q")?.trim();

      if (!query) {
        return json({ error: "Search query is required" }, 400);
      }

      try {
        const results = await getJamendoTracks(
          { search: query },
          env
        );

        return json({
          tracks: results.map(track => ({
            id: String(track.id),
            title: track.name,
            artist: track.artist_name || "Unknown artist",
            album: track.album_name || "",
            duration: Number(track.duration) || 0,
            artworkURL: track.image || track.album_image || "",
            format: "flac",
            audioQuality: "LOSSLESS"
          }))
        });
      } catch (error) {
        return json({
          error: "Search failed",
          message: error.message
        }, 502);
      }
    }

    if (url.pathname.startsWith("/stream/")) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405);
      }

      const denied = await auth.guard(request);
      if (denied) return denied;

      const id = decodeURIComponent(url.pathname.slice(8));

      if (!/^\d+$/.test(id)) {
        return json({ error: "Invalid track ID" }, 400);
      }

      try {
        const results = await getJamendoTracks(
          { id, audioformat: "flac" },
          env
        );

        const track = results[0];

        if (!track || !track.audio) {
          return json({ error: "Track stream unavailable" }, 404);
        }

        return json({
          url: track.audio,
          format: "flac",
          quality: "FLAC",
          codec: "flac",
          container: "flac",
          manifest: "none",
          encrypted: false
        });
      } catch (error) {
        return json({
          error: "Stream failed",
          message: error.message
        }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  }
};
