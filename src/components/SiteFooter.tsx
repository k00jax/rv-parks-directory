export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <p>
          <strong>Disclosure:</strong> This site may earn affiliate commissions when you book
          through links on this page, at no extra cost to you. We only link to campgrounds and
          services we can verify from public Recreation.gov data. Details such as prices, hookups,
          and amenities are provided as-is from the source data and may change; always confirm with
          the campground before booking.
        </p>
        <p className="muted">
          Data source: Recreation.gov (RIDB) public facility data · v2.0.0 · Updated 2026-08-20 ·
          Not affiliated with Recreation.gov.
        </p>
      </div>
    </footer>
  );
}
