/** Capture the displayed view locally. The renderer is loaded only on download. */
export async function downloadScheduleImage(node: HTMLElement, filename: string): Promise<void> {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  const backgroundColor = getComputedStyle(node).getPropertyValue("--court-bg").trim();
  const blob = await toBlob(node, {
    backgroundColor, pixelRatio: 2, width: node.clientWidth, height: node.scrollHeight,
    skipFonts: true,
    filter: element => !(element instanceof HTMLElement && element.hasAttribute("data-export-ignore")),
  });
  if (!blob) throw new Error("Schedule image is empty");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.download = filename; link.href = url;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
