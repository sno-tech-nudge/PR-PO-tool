// One consistent icon set (stroke-based, same style as the PR/Vendor quick
// action tiles on the Home dashboard) reused across the sidebar nav and
// every status badge, instead of a mix of unicode glyphs and colored text.
// Each icon is a plain function component: size/color/style are the only
// props, so call sites stay simple ( <Icon.Home size={16} /> ).

function Base({ size = 16, color = 'currentColor', children, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  )
}

const Home = (props) => (
  <Base {...props}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M9 22V12h6v10" />
  </Base>
)

const History = (props) => (
  <Base {...props}>
    <path d="M12 8v4l3 3" />
    <path d="M3.05 11a9 9 0 1 1 .5 4" />
    <path d="M3 4v7h7" />
  </Base>
)

const Approvals = (props) => (
  <Base {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m8 12 3 3 5-6" />
  </Base>
)

const Finance = (props) => (
  <Base {...props}>
    <path d="M6 3h9l3 3v15H6z" />
    <path d="M9 8h4a2 2 0 0 1 0 4H9" />
    <path d="M9 12h4" />
    <path d="M11 8v8" />
  </Base>
)

const PurchaseRequest = (props) => (
  <Base {...props}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </Base>
)

const PurchaseOrder = (props) => (
  <Base {...props}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </Base>
)

const Vendor = (props) => (
  <Base {...props}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </Base>
)

const Settings = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Base>
)

const PlusCircle = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </Base>
)

const FolderPlus = (props) => (
  <Base {...props}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <path d="M12 10v6" />
    <path d="M9 13h6" />
  </Base>
)

const CheckCircle = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" />
  </Base>
)

const Clock = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Base>
)

const XCircle = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </Base>
)

const AlertTriangle = (props) => (
  <Base {...props}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Base>
)

const CircleDot = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill={props.color || 'currentColor'} stroke="none" />
  </Base>
)

const Icon = {
  Home, History, Approvals, Finance, PurchaseRequest, PurchaseOrder, Vendor,
  Settings, PlusCircle, FolderPlus, CheckCircle, Clock, XCircle, AlertTriangle, CircleDot,
}

export default Icon
