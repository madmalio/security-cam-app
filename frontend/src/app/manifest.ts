import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CamView NVR",
    short_name: "CamView",
    description: "Private Security Dashboard",
    start_url: "/",
    display: "standalone", // Hides the browser UI
    background_color: "#18181b", // Matches zinc-900 (Dark mode bg)
    theme_color: "#18181b",
    orientation: "any", // Allow rotation for full screen video
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
