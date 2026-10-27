"use client";
import { Select } from "radix-ui";
import { useRef, useState } from "react";

/** Shared, keyboard-accessible dropdown. Portal stays inside its containing dialog. */
export default function CitySelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Elige una opción…",
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  return (
    <Select.Root
      value={value}
      onValueChange={onChange}
      onOpenChange={(open) => {
        if (open)
          setContainer(
            trigger.current?.closest<HTMLElement>(".dialog") ?? undefined,
          );
      }}
      disabled={disabled}
    >
      <Select.Trigger ref={trigger} id={id} className="city-select">
        <Select.Value placeholder={placeholder} />
        <Select.Icon aria-hidden>⌄</Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Content
          className="city-select-menu"
          position="popper"
          sideOffset={8}
          collisionPadding={16}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <Select.ScrollUpButton className="city-select-scroll">
            ⌃
          </Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="city-select-option"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator aria-hidden>✓</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="city-select-scroll">
            ⌄
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
