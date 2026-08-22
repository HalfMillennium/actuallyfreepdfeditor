/**
 * Captured feed shapes, used to test the parser without network access.
 *
 * The Google Trends RSS shape is undocumented and has changed before, so these
 * fixtures pin the structure the parser expects: namespaced `ht:` elements,
 * CDATA-wrapped snippets, and nested news items whose text carries the document
 * intent the bare trend title lacks.
 */

export const TRENDS_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
<channel>
  <title>Daily Search Trends</title>
  <item>
    <title>Chiefs vs Bills</title>
    <ht:approx_traffic>500K+</ht:approx_traffic>
    <pubDate>Mon, 24 Aug 2026 09:00:00 -0700</pubDate>
    <ht:news_item>
      <ht:news_item_title>Chiefs edge Bills in overtime thriller</ht:news_item_title>
      <ht:news_item_snippet><![CDATA[The quarterback threw for 340 yards on Sunday night.]]></ht:news_item_snippet>
    </ht:news_item>
  </item>
  <item>
    <title>student loan forgiveness</title>
    <ht:approx_traffic>200K+</ht:approx_traffic>
    <pubDate>Mon, 24 Aug 2026 08:00:00 -0700</pubDate>
    <ht:news_item>
      <ht:news_item_title>Borrowers rush to file before the window closes</ht:news_item_title>
      <ht:news_item_snippet><![CDATA[The application form must be submitted with a signed certification before the deadline.]]></ht:news_item_snippet>
    </ht:news_item>
    <ht:news_item>
      <ht:news_item_title>What the servicers are telling borrowers</ht:news_item_title>
      <ht:news_item_snippet>Applicants report trouble with the PDF not accepting typed entries.</ht:news_item_snippet>
    </ht:news_item>
  </item>
  <item>
    <title>Taylor tour dates</title>
    <ht:approx_traffic>1M+</ht:approx_traffic>
    <pubDate>Mon, 24 Aug 2026 07:00:00 -0700</pubDate>
    <ht:news_item>
      <ht:news_item_title>Tour adds three stadium shows</ht:news_item_title>
      <ht:news_item_snippet>Presale begins Friday morning.</ht:news_item_snippet>
    </ht:news_item>
  </item>
</channel>
</rss>`;

export const NEWS_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>"PDF form" deadline - Google News</title>
  <item>
    <title>IRS reminds filers that the amended return form must be signed &amp; dated</title>
    <link>https://news.example.com/a</link>
    <pubDate>Sat, 22 Aug 2026 14:03:00 GMT</pubDate>
    <description><![CDATA[<a href="https://news.example.com/a">IRS reminds filers</a>&nbsp;&nbsp;<font color="#6f6f6f">Example Wire</font>]]></description>
    <source url="https://news.example.com">Example Wire</source>
  </item>
  <item>
    <title>State agency moves benefits enrollment to a fillable PDF</title>
    <link>https://news.example.com/b</link>
    <pubDate>Fri, 21 Aug 2026 09:12:00 GMT</pubDate>
    <description>Residents must complete the form online this year.</description>
    <source url="https://other.example.com">Other Daily</source>
  </item>
</channel>
</rss>`;
