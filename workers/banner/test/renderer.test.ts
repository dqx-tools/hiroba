import { describe, it, expect } from "vitest";
import { renderSvg } from "../src/renderer";
import type { TranslatedText, BoundingBox, TextStyle } from "../src/types";

describe("renderer", () => {
	describe("renderSvg", () => {
		it("should create valid SVG with background image", () => {
			const svg = renderSvg("data:image/png;base64,abc123", 100, 50, []);
			expect(svg).toContain('<svg width="100" height="50"');
			expect(svg).toContain("xmlns=");
			expect(svg).toContain('<image href="data:image/png;base64,abc123"');
			expect(svg).toContain("</svg>");
		});

		it("should include translated text elements", () => {
			const box: BoundingBox = {
				vertices: [
					{ x: 0, y: 0 },
					{ x: 100, y: 0 },
					{ x: 100, y: 30 },
					{ x: 0, y: 30 },
				],
			};

			const style: TextStyle = {
				foregroundColor: "#ffffff",
				borderColor: "#000000",
				fontWeight: 700,
				fontSize: 24,
			};

			const texts: TranslatedText[] = [
				{
					original: "テスト",
					translated: "Test",
					boundingBox: box,
					style,
					fontFamily: "Open Sans",
				},
			];

			const svg = renderSvg("data:image/png;base64,abc", 200, 100, texts);
			expect(svg).toContain("<text");
			expect(svg).toContain("Test");
			expect(svg).toContain('fill="#ffffff"');
			expect(svg).toContain('stroke="#000000"');
			expect(svg).toContain('font-weight="700"');
			expect(svg).toContain('font-family="Open Sans"');
		});

		it("should escape special characters in text", () => {
			const box: BoundingBox = {
				vertices: [
					{ x: 0, y: 0 },
					{ x: 100, y: 0 },
					{ x: 100, y: 30 },
					{ x: 0, y: 30 },
				],
			};

			const style: TextStyle = {
				foregroundColor: "#fff",
				borderColor: "#000",
				fontWeight: 400,
				fontSize: 16,
			};

			const texts: TranslatedText[] = [
				{
					original: "test",
					translated: "<Test & \"Quotes\">",
					boundingBox: box,
					style,
					fontFamily: "Arial",
				},
			];

			const svg = renderSvg("data:image/png;base64,x", 100, 50, texts);
			expect(svg).toContain("&lt;Test");
			expect(svg).toContain("&amp;");
			expect(svg).toContain("&quot;");
			expect(svg).toContain("&gt;");
		});
	});
});
