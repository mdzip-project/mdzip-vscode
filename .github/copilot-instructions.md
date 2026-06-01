<!-- mdzip-mcp-review-guidance:start -->
## MDZip MCP Review Guidance

When reviewing, summarizing, or analyzing `.mdz` files:

1. Call `mdz_review_document` first with the `.mdz` `archivePath`.
2. Use the returned markdown text and MCP image payloads together in the same analysis.
3. Do not extract archive entries to disk unless the user explicitly asks for extraction.
4. Use lower-level tools (`mdz_list_entries`, `mdz_read_text`, `mdz_read_image`) only for follow-up detail checks.
<!-- mdzip-mcp-review-guidance:end -->
