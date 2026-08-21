export default function HomePage() {
  return (
    <main>
      <h1>Institutional Knowledge Platform</h1>
      <p>
        A search-first institutional document and knowledge platform. Remember only the meaning of a
        notice — find the authoritative source in seconds.
      </p>

      <form action="/search" method="GET" className="card" role="search" aria-label="Global search">
        <label htmlFor="home-search">Search</label>
        <input
          id="home-search"
          name="q"
          type="search"
          placeholder="Search anything in your institution…"
          aria-label="Search query"
          required
        />
        <button type="submit">Search</button>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Try: &ldquo;When is exam form submission?&rdquo; · &ldquo;Find the hostel fee
          notice&rdquo;
        </p>
      </form>

      <p>
        <strong>Working title.</strong> The commercial brand is intentionally deferred until MVP
        validation. Search, documents, and the Ask Institution experience arrive with the MVP
        phases.
      </p>
      <p>
        <a href="/login">Sign in</a> · <a href="/admin">Admin</a> · <a href="/search">Search</a> ·{' '}
        <a href="/ask">Ask Institution</a> · <a href="/dates">Important dates</a>
      </p>
    </main>
  );
}
