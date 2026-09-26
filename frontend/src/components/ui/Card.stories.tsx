import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardDivider } from './Card';

/**
 * `Card` is the primary container for grouped content in NeuroWealth.
 *
 * ### Variants
 * | Variant  | Use case |
 * |----------|----------|
 * | default  | Standard dashboard panels |
 * | glass    | Hero sections, dark background overlays |
 * | elevated | Modals, popovers, dropdowns |
 * | outlined | List items, table rows, minimal layout |
 */
const meta: Meta<typeof Card> = {
  title:     'Design System/Card',
  component: Card,
  tags:      ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    variant:     { control: 'select', options: ['default', 'glass', 'elevated', 'outlined'] },
    padding:     { control: 'select', options: ['none', 'sm', 'md', 'lg'] },
    interactive: { control: 'boolean' },
    glowOnHover: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    variant:  'default',
    padding:  'md',
    children: 'Card content goes here.',
  },
};

export const Glass: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    variant:  'glass',
    padding:  'md',
    children: 'Glass card content.',
  },
};

export const Elevated: Story = {
  args: {
    variant:  'elevated',
    padding:  'md',
    children: 'Elevated card with shadow.',
  },
};

export const Outlined: Story = {
  args: {
    variant:  'outlined',
    padding:  'md',
    children: 'Outlined card.',
  },
};

export const WithHeaderAndDivider: Story = {
  render: () => (
    <Card variant="default" padding="md" className="w-80">
      <CardHeader
        title="Portfolio Balance"
        description="Your current vault position"
        action={<span className="text-xs text-green-500">● Live</span>}
      />
      <CardDivider />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        1,234.56 USDC
      </p>
    </Card>
  ),
};

export const Interactive: Story = {
  args: {
    variant:     'default',
    padding:     'md',
    interactive: true,
    glowOnHover: true,
    children:    'Click me — hover for glow effect.',
  },
};
