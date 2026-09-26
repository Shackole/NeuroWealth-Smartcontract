import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date:  /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff'  },
        { name: 'dark',  value: '#080b11'  },
        { name: 'card-dark', value: '#121824' },
      ],
    },
    a11y: {
      config: {},
      options: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
      },
    },
  },
  decorators: [
    (Story, context) => {
      // Apply dark class to html element when dark background is selected
      const isDark = context.globals?.backgrounds?.value === '#080b11'
                  || context.globals?.backgrounds?.value === '#121824';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', isDark);
      }
      return <Story />;
    },
  ],
};

export default preview;
