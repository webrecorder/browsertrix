import { Text } from "@react-email/components";

export const Warning = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-base font-semibold text-red-600 bg-red-50 rounded-lg p-4 border border-red-500 border-solid">
    {children}
  </Text>
);
