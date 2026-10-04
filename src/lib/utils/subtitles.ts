/** Converts SRT to WebVTT. Input already in VTT is returned unchanged. */
export function toVtt(text: string): string {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (clean.startsWith("WEBVTT")) return `${clean}\n`;
  const body = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}\n`;
}
