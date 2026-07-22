import { Button as EmailButton } from "@react-email/components";

export const Button = ({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) => {
  return (
    <EmailButton
      className="rounded-full px-6 text-base py-4 shadow bg-cyan-400 font-semibold text-white ring-1 ring-inset ring-cyan-600 hover:bg-cyan-500 dark:ring-cyan-300 shadow-cyan-700/25 hover:shadow-cyan-800/25 text-center transition"
      href={href}
      style={{
        boxShadow:
          "rgb(255, 255, 255) 0px 0px 0px 0px inset, rgb(3, 91, 113) 0px 0px 0px 1px inset, rgba(1, 63, 80, 0.25) 0px 4px 6px -1px, rgba(1, 63, 80, 0.25) 0px 2px 4px -2px",
        textDecoration: "none",
      }}
    >
      {children}
    </EmailButton>
  );
};
