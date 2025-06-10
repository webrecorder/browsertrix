import React from "react";

export const ColorSwatch = ({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) => {
  return (
    <span
      className="sb-unstyled inline-flex items-baseline ring-1"
      style={
        {
          "--tw-ring-color": "rgb(236, 244, 249)",
          "--tw-ring-inset": "inset",
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 5,
          paddingRight: 2,
        } as React.CSSProperties
      }
    >
      {children}
      <span
        className="font-monospace inline-block self-center rounded-sm ring-1"
        style={
          {
            width: 21,
            height: 21,
            backgroundColor: color,
            "--tw-ring-color": "#0004",
            "--tw-ring-inset": "inset",
          } as React.CSSProperties
        }
      ></span>
    </span>
  );
};
