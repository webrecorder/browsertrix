import { Text } from "react-email";

export const Tip = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-base font-semibold text-cyan-600 bg-cyan-50 rounded-lg p-4 border border-cyan-500 border-solid">
    {children}
  </Text>
);
