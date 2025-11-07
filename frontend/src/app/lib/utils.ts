/**
 * Creates initials from a camera name.
 * e.g., "Front Door" -> "FD", "ShopCam" -> "S"
 */
export function getInitials(name: string): string {
  const words = name.split(" ");
  if (words.length > 1) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
