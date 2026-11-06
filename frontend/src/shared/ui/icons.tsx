import type { SVGProps } from 'react';

// Iconos de trazo simple. Son decorativos: el texto o el aria-label del control que los contiene es quien informa.
function Icon({ children, ...rest }: Readonly<SVGProps<SVGSVGElement>>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      className="stroke-current"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MenuIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const UserIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1-4 4-6 8-6s7 2 8 6" />
  </Icon>
);

export const SearchIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Icon>
);

export const BagIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
);

export const CakeIcon = (props: Readonly<SVGProps<SVGSVGElement>>) => (
  <Icon {...props}>
    <path d="M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" />
    <path d="M5 15c2 1.5 3.5 1.5 5 0s3-1.5 4 0 3 1.5 5 0" />
    <path d="M12 12V8M12 5.5v.01" />
  </Icon>
);
