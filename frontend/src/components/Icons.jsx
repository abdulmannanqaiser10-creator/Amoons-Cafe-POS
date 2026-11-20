/**
 * Inline stroke icons. They inherit currentColor and sizing from the
 * consuming stylesheet rule, like the icons already used on Home.
 */
function Icon({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <Icon strokeWidth="2.2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.2-4.2" />
    </Icon>
  );
}

export function FilterIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h17M6.5 12h11M10 18h4" />
    </Icon>
  );
}

export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 11.5a8 8 0 1 0-2.6 6.1" />
      <path d="M20.5 5.5V11h-5.5" />
    </Icon>
  );
}

export function PlusIcon(props) {
  return (
    <Icon strokeWidth="2.6" {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function MinusIcon(props) {
  return (
    <Icon strokeWidth="2.6" {...props}>
      <path d="M5.5 12h13" />
    </Icon>
  );
}

export function CloseIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon strokeWidth="2.6" {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="m14.5 5.5-7 6.5 7 6.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="m9.5 5.5 7 6.5-7 6.5" />
    </Icon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="m5.5 9 6.5 6 6.5-6" />
    </Icon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <Icon strokeWidth="2.2" {...props}>
      <path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5" />
    </Icon>
  );
}

export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </Icon>
  );
}

export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 20.2h4.2L19.5 8.9a2.1 2.1 0 0 0 0-3l-1.4-1.4a2.1 2.1 0 0 0-3 0L3.8 15.9v4.3Z" />
      <path d="m13.6 6.2 4.2 4.2" />
    </Icon>
  );
}

export function EditIcon(props) {
  return <PencilIcon {...props} />;
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.8h15" />
      <path d="M9.4 6.8V5.1A1.4 1.4 0 0 1 10.8 3.7h2.4a1.4 1.4 0 0 1 1.4 1.4v1.7" />
      <path d="M6.6 6.8 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12.2" />
      <path d="M10.4 10.4v6M13.6 10.4v6" />
    </Icon>
  );
}

export function PrinterIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 9V3.6h10V9" />
      <path d="M7 17H5.2a1.2 1.2 0 0 1-1.2-1.2v-5.6a1.2 1.2 0 0 1 1.2-1.2h13.6a1.2 1.2 0 0 1 1.2 1.2v5.6A1.2 1.2 0 0 1 18.8 17H17" />
      <rect x="7" y="13.5" width="10" height="7" rx="1.2" />
    </Icon>
  );
}

export function BanIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="m6.4 6.4 11.2 11.2" />
    </Icon>
  );
}

export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.3V12l3.2 2" />
    </Icon>
  );
}

export function FlameIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.2c3.4 3 5.6 5.5 5.6 8.7a5.6 5.6 0 0 1-11.2 0c0-1.7.7-2.9 1.7-4 .3 1.1 1 1.8 1.9 2 0-2.6.9-4.5 2-6.7Z" />
    </Icon>
  );
}

export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6.4 16.5V11a5.6 5.6 0 0 1 11.2 0v5.5l1.6 2.3H4.8l1.6-2.3Z" />
      <path d="M10 21.2a2.4 2.4 0 0 0 4 0" />
    </Icon>
  );
}

export function CheckCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.4 12.2 2.5 2.5 4.7-4.9" />
    </Icon>
  );
}

export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.8 21 19.4H3L12 3.8Z" />
      <path d="M12 9.6v4.2" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function InboxIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 13.5 6 5.2h12l2.5 8.3" />
      <path d="M3.5 13.5h4.6l1.3 2.6h5.6l1.3-2.6h4.6v4.2a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6v-4.2Z" />
    </Icon>
  );
}

export function UserIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </Icon>
  );
}

export function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8.1 3.8H5.4A1.7 1.7 0 0 0 3.7 5.6C3.7 13.8 10.2 20.3 18.4 20.3a1.7 1.7 0 0 0 1.7-1.7v-2.7l-4.3-1.4-1.9 2a13.4 13.4 0 0 1-5.4-5.4l2-1.9L8.1 3.8Z" />
    </Icon>
  );
}

export function MapPinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21.2s6.8-5.6 6.8-11a6.8 6.8 0 1 0-13.6 0c0 5.4 6.8 11 6.8 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

export function NoteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20.2 14.6a2 2 0 0 1-2 2H8.6L4 20.4V5.6a2 2 0 0 1 2-2h12.2a2 2 0 0 1 2 2v9Z" />
      <path d="M8 9h8M8 12.2h5" />
    </Icon>
  );
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2" />
      <path d="M3.6 10h16.8M8.4 3.6v3.2M15.6 3.6v3.2" />
    </Icon>
  );
}

export function BanknoteIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="6.4" width="18.8" height="11.2" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.6v4.8M18 9.6v4.8" />
    </Icon>
  );
}

export function CardIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.2" />
      <path d="M2.6 10h18.8M6.4 14.6h4" />
    </Icon>
  );
}

export function GlobeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.6 12h16.8M12 3.4c2.3 2.4 3.4 5.3 3.4 8.6s-1.1 6.2-3.4 8.6c-2.3-2.4-3.4-5.3-3.4-8.6S9.7 5.8 12 3.4Z" />
    </Icon>
  );
}

export function CutleryIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 3.6v6.2a2.1 2.1 0 0 0 4.2 0V3.6M9.1 11.9v8.5" />
      <path d="M17.4 3.6c-1.8 1-2.8 3-2.8 5.3 0 1.6.9 2.6 2.3 2.9l.5 8.6" />
    </Icon>
  );
}

export function BagIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5.2 8h13.6l-1.2 12H6.4L5.2 8Z" />
      <path d="M8.6 8V6a3.4 3.4 0 0 1 6.8 0v2" />
    </Icon>
  );
}

export function BikeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="5.6" cy="17" r="3.2" />
      <circle cx="18.4" cy="17" r="3.2" />
      <path d="M8.8 17h5.2l-2.4-8H8.6M14 9h3.2l1.2 8M11.6 9 9.4 5.6H7" />
    </Icon>
  );
}

export function LeafIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 4.5C11.5 4 5 8 5 14a5.4 5.4 0 0 0 5.4 5.4C16.4 19.4 20 12.6 20 4.5Z" />
      <path d="M6.8 17.4C9.4 13 13 10.2 17 8.6" />
    </Icon>
  );
}

export function ReceiptIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3.4h12v17.2l-3-1.8-3 1.8-3-1.8-3 1.8V3.4Z" />
      <path d="M9 8h6M9 11.6h6M9 15.2h3.6" />
    </Icon>
  );
}

export function TrendingIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.6 16.6l5-5.2 3.4 3.2 5.6-6.4" />
      <path d="M20.4 8.2h-4.2M20.4 8.2v4.2" />
    </Icon>
  );
}

export function WalletIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.6 7.4a2 2 0 0 1 2-2h11.6v3.2" />
      <rect x="3.6" y="7.4" width="16.8" height="12.2" rx="2" />
      <circle cx="16.4" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ChartIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 20.2V10M9.6 20.2V4M15.2 20.2v-7.4M20.8 20.2V8" />
    </Icon>
  );
}

export function CartIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.8 4h2.4l2.3 10.6a1.7 1.7 0 0 0 1.7 1.35h7.9a1.7 1.7 0 0 0 1.66-1.32L20.6 8.2H6.1" />
      <circle cx="9.8" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function StatusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" />
      <path d="M20.6 4.6V10h-5.4" />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
    </Icon>
  );
}

export function ClipboardIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8.5 4.5H7A2 2 0 0 0 5 6.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-1.5" />
      <rect x="8.5" y="2.5" width="7" height="4" rx="1.4" />
      <path d="m8.8 13.6 2.2 2.2 4.2-4.4" />
    </Icon>
  );
}

export function ReverseIcon(props) {
  return (
    <Icon strokeWidth="2.2" {...props}>
      <path d="M4.6 8.6h9.7a5.3 5.3 0 0 1 0 10.6H9.4" />
      <path d="M8.8 4.4 4.6 8.6l4.2 4.2" />
    </Icon>
  );
}

export function DownloadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.8v10.4" />
      <path d="m7.8 10.4 4.2 4.2 4.2-4.2" />
      <path d="M4.6 18.2v1.2a1.4 1.4 0 0 0 1.4 1.4h12a1.4 1.4 0 0 0 1.4-1.4v-1.2" />
    </Icon>
  );
}

export function UploadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 20.2V9.8" />
      <path d="m7.8 13.8 4.2-4.2 4.2 4.2" />
      <path d="M4.6 5.8v-1.2a1.4 1.4 0 0 1 1.4-1.4h12a1.4 1.4 0 0 1 1.4 1.4v1.2" />
    </Icon>
  );
}

export function PowerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.4v8.2" />
      <path d="M6.8 6.6a7.4 7.4 0 1 0 10.4 0" />
    </Icon>
  );
}

export function FlagIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 21V3.6" />
      <path d="M6 4.4h10.4l-2 3.6 2 3.6H6" />
    </Icon>
  );
}

export function ArrowUpIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="M12 19.5V5" />
      <path d="m5.8 11.2 6.2-6.2 6.2 6.2" />
    </Icon>
  );
}

export function ArrowDownIcon(props) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="M12 4.5V19" />
      <path d="m5.8 12.8 6.2 6.2 6.2-6.2" />
    </Icon>
  );
}

export function VolumeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 9.4h3l4-3v11.2l-4-3h-3a1 1 0 0 1-1-1v-3.2a1 1 0 0 1 1-1Z" />
      <path d="M14.8 9.2a3.6 3.6 0 0 1 0 5.6" />
      <path d="M17.6 6.6a7 7 0 0 1 0 10.8" />
    </Icon>
  );
}

export function GearIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.1 14.9a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46V21a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H3a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A1.94 1.94 0 1 1 6.93 4.3l.06.06a1.6 1.6 0 0 0 1.77.32H8.8a1.6 1.6 0 0 0 .97-1.46V3a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97H21a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.46.97Z" />
    </Icon>
  );
}

export function WifiIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.8 9.2a13 13 0 0 1 18.4 0" />
      <path d="M6 12.6a8.4 8.4 0 0 1 12 0" />
      <path d="M9.2 16a3.9 3.9 0 0 1 5.6 0" />
      <circle cx="12" cy="19.4" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function UsbIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 20.5V4.2" />
      <path d="m9 7.2 3-3 3 3" />
      <path d="M12 13.5 8.4 10v3.6" />
      <path d="m12 11.5 3.6 3.6v2.4" />
    </Icon>
  );
}

export function CashPullIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="7" width="18.4" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 12h.01M18 12h.01" />
    </Icon>
  );
}

export function InfoIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2" />
      <circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.2 5 5.8v5.6c0 4 2.9 7.1 7 8.4 4.1-1.3 7-4.4 7-8.4V5.8Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </Icon>
  );
}

export function HelpIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 14.5v-2.7a8 8 0 0 1 16 0v2.7" />
      <rect x="2.6" y="13.4" width="4.6" height="7.2" rx="2.3" />
      <rect x="16.8" y="13.4" width="4.6" height="7.2" rx="2.3" />
      <path d="M19.1 20.6c0 1.6-1.7 2.6-4.3 2.9" />
    </Icon>
  );
}

export function ArrowRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5" />
    </Icon>
  );
}

export function BookIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 5.5a2 2 0 0 1 2-2H12v17H5.5a2 2 0 0 0-2 2z" />
      <path d="M20.5 5.5a2 2 0 0 0-2-2H12v17h6.5a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

export function PlayIcon(props) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M8 5.5v13L19 12 8 5.5Z" />
    </Icon>
  );
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Icon>
  );
}

export function SupportIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="12" width="4.5" height="7" rx="2" />
      <rect x="17" y="12" width="4.5" height="7" rx="2" />
      <path d="M18 19c-.8 1.7-2.7 2.5-5 2.5" />
    </Icon>
  );
}

export function FileTextIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v5h5M8 12h8M8 16h8" />
    </Icon>
  );
}
