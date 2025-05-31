import { SlotType } from "@/lib/types";

interface SlotProps {
  name: SlotType;
  children: React.ReactNode;
}

export const Slot: React.FC<SlotProps> = ({ name, children }) => {
  const classMap: Record<SlotType, string> = {
    primary: 'w-1/2 p-2 flex flex-col gap-2',
    sidebar: 'w-1/4 p-2 flex flex-col gap-2',
  };

  return <div className={classMap[name]}>{children}</div>;
};