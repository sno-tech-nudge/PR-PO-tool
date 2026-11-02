import { getLocation } from '../../lib/donorData'

// Where the work is, small and blue in brackets, for whoever reads the form. Location is not
// something the filer picks: it comes from the mapping sheet, by donor. Shows nothing when the
// sheet does not say (or says several places for the same donor).
export function LocationTag({ entity, program, subprogram, donor }) {
  const loc = getLocation(entity, program, subprogram, donor)
  if (!loc) return null
  return <span title="Location" style={{ fontSize: '11px', color: 'var(--info-blue)', marginLeft: '5px', whiteSpace: 'nowrap' }}>({loc})</span>
}

// "Entity / Programme / Sub-programme (Location) / Donor" for one allocation line.
export function AllocationPath({ a }) {
  const parts = [
    { v: a?.entity }, { v: a?.program },
    { v: a?.subprogram, tag: true }, { v: a?.donor },
  ].filter(p => p.v)
  if (!parts.length) return '—'
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 ? ' / ' : ''}{p.v}
      {p.tag && <LocationTag entity={a.entity} program={a.program} subprogram={a.subprogram} donor={a.donor} />}
    </span>
  ))
}
