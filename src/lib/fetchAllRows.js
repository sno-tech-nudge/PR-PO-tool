// Supabase/PostgREST caps a single select() at 1000 rows by default —
// silently, no error, just a quietly truncated result ordered however the
// query asked. Any query that isn't already scoped down to something
// naturally small (one person's own rows, one status, etc.) needs to page
// through with .range() instead, or it'll start dropping rows the moment
// the table crosses that line — exactly what happened to the Purchase
// Orders list once real historical POs took it past 1000 rows.
//
// `buildQuery(from, to)` must build the query FRESH each call (select,
// filters, order — everything except .range()) since a Supabase query
// builder is single-use once awaited.
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) {
      console.error('fetchAllRows: a page failed to load', error)
      break
    }
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}
