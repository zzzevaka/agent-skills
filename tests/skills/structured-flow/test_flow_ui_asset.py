import re
import unittest
from pathlib import Path

ASSET = (
    Path(__file__).resolve().parents[3]
    / "skills"
    / "structured-flow"
    / "assets"
    / "flow-ui.html"
)


class FlowUiAssetTests(unittest.TestCase):
    def setUp(self):
        self.page = ASSET.read_text(encoding="utf-8")

    def test_page_is_static_with_no_template_placeholders_or_embedded_flow(self):
        for leftover in ("__TITLE__", "__FLOW_DATA__", 'id="flow-data"'):
            self.assertNotIn(leftover, self.page)
        self.assertIn("<title>structured-flow</title>", self.page)

    def test_page_loads_nothing_from_the_network(self):
        remote = re.findall(
            r"""(?:src|href)\s*=\s*["']\s*(?:https?:)?//""", self.page
        )
        self.assertEqual(remote, [])

    def test_page_has_no_remote_urls_in_css_or_imports(self):
        remote_css = re.findall(
            r"""url\(\s*["']?\s*(?:https?:)?//""", self.page
        )
        self.assertEqual(remote_css, [])
        styles = re.findall(r"<style[^>]*>(.*?)</style>", self.page, re.S)
        self.assertTrue(styles)
        for css in styles:
            self.assertNotIn("@import", css)

    def test_page_declares_a_content_security_policy(self):
        self.assertIn("Content-Security-Policy", self.page)


if __name__ == "__main__":
    unittest.main()
