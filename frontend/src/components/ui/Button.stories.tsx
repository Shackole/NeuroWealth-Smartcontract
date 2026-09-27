import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

/**
 * The `Button` is the primary interactive element in the NeuroWealth design system.
 *
 * ### When to use
 * - Use **primary** for the main action on a screen (Deposit, Confirm).
 * - Use **secondary** for auxiliary actions (Cancel, Back).
 * - Use **danger** for irreversible actions (Withdraw All, Delete).
 * - Use **ghost** for icon-only or toolbar actions.
 * - Use **link** inline within prose.
 *
 * ### Accessibility
 * - All variants meet WCAG AA contrast.
 * - Focus ring visible for keyboard navigation.
 * - `isLoading` sets `aria-busy` and replaces children with a spinner.
 */
const meta: Meta<typeof Button> = {
  title:     'Design System/Button',
  component: Button,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant:   { control: 'select', options: ['primary', 'secondary', 'danger', 'ghost', 'link'] },
    size:      { control: 'select', options: ['sm', 'md', 'lg'] },
    isLoading: { control: 'boolean' },
    disabled:  { control: 'boolean' },
    fullWidth: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant:  'primary',
    size:     'md',
    children: 'Deposit USDC',
  },
};

export const Secondary: Story = {
  args: {
    variant:  'secondary',
    size:     'md',
    children: 'Cancel',
  },
};

export const Danger: Story = {
  args: {
    variant:  'danger',
    size:     'md',
    children: 'Withdraw All',
  },
};

export const Ghost: Story = {
  args: {
    variant:  'ghost',
    size:     'md',
    children: 'Settings',
  },
};

export const Link: Story = {
  args: {
    variant:  'link',
    size:     'md',
    children: 'View transaction history',
  },
};

export const Loading: Story = {
  args: {
    variant:   'primary',
    size:      'md',
    isLoading: true,
    children:  'Processing…',
  },
};

export const Disabled: Story = {
  args: {
    variant:  'primary',
    size:     'md',
    disabled: true,
    children: 'Connect Wallet',
  },
};

export const SmallSize: Story = {
  args: {
    variant:  'secondary',
    size:     'sm',
    children: 'Switch strategy',
  },
};

export const LargeSize: Story = {
  args: {
    variant:  'primary',
    size:     'lg',
    children: 'Get Started',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 items-start">
      <div className="flex gap-3 flex-wrap">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="md">Medium</Button>
        <Button variant="primary" size="lg">Large</Button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Button variant="primary" isLoading>Loading</Button>
        <Button variant="secondary" disabled>Disabled</Button>
      </div>
    </div>
  ),
};
