import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

/**
 * `Badge` is a small inline label for status, strategy type, and protocol indicators.
 *
 * ### Colour semantics
 * | Variant    | Use case |
 * |------------|----------|
 * | success    | Conservative strategy, positive yield, confirmed state |
 * | warning    | Balanced strategy, rate limit approaching, caution |
 * | error      | Vault paused, error state, high-risk |
 * | info       | APY display, informational |
 * | primary    | Brand highlight |
 * | secondary  | Chart segment, secondary info |
 * | neutral    | Default / inactive state |
 */
const meta: Meta<typeof Badge> = {
  title:     'Design System/Badge',
  component: Badge,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: { control: 'select', options: ['success', 'warning', 'error', 'info', 'primary', 'secondary', 'neutral'] },
    dot:     { control: 'boolean' },
    live:    { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { variant: 'neutral', children: 'Neutral' },
};

export const Success: Story = {
  args: { variant: 'success', children: 'Conservative' },
};

export const Warning: Story = {
  args: { variant: 'warning', children: 'Balanced' },
};

export const Error: Story = {
  args: { variant: 'error', children: 'Paused' },
};

export const Info: Story = {
  args: { variant: 'info', children: '8.4% APY' },
};

export const WithDot: Story = {
  args: { variant: 'success', dot: true, children: 'Active' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success"   dot>Conservative</Badge>
      <Badge variant="warning"   dot>Balanced</Badge>
      <Badge variant="error"     dot>Growth</Badge>
      <Badge variant="info"          >8.4% APY</Badge>
      <Badge variant="primary"       >Soroban</Badge>
      <Badge variant="secondary"     >Blend</Badge>
      <Badge variant="neutral"       >Inactive</Badge>
    </div>
  ),
};
