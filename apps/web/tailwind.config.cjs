const withOpacity = (variableName) => {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variableName}))`;
    }

    return `rgb(var(${variableName}) / ${opacityValue})`;
  };
};

/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: withOpacity("--tw-color-primary"),
        "primary-container": withOpacity("--tw-color-primary-container"),
        "primary-hover": withOpacity("--tw-color-primary-hover"),
        "on-primary": withOpacity("--tw-color-on-primary"),
        secondary: withOpacity("--tw-color-secondary"),
        "secondary-container": withOpacity("--tw-color-secondary-container"),
        "on-secondary": withOpacity("--tw-color-on-secondary"),
        background: withOpacity("--tw-color-background"),
        "on-background": withOpacity("--tw-color-on-background"),
        surface: withOpacity("--tw-color-surface"),
        "surface-container-lowest": withOpacity(
          "--tw-color-surface-container-lowest"
        ),
        "surface-container-low": withOpacity(
          "--tw-color-surface-container-low"
        ),
        "surface-container": withOpacity("--tw-color-surface-container"),
        "surface-container-high": withOpacity(
          "--tw-color-surface-container-high"
        ),
        "surface-container-highest": withOpacity(
          "--tw-color-surface-container-highest"
        ),
        "on-surface": withOpacity("--tw-color-on-surface"),
        "on-surface-variant": withOpacity("--tw-color-on-surface-variant"),
        error: withOpacity("--tw-color-error"),
        "error-container": withOpacity("--tw-color-error-container"),
        "on-error": withOpacity("--tw-color-on-error"),
        outline: withOpacity("--tw-color-outline"),
        "outline-variant": withOpacity("--tw-color-outline-variant"),
        tertiary: withOpacity("--tw-color-tertiary"),
        "tertiary-container": withOpacity("--tw-color-tertiary-container"),
        "on-tertiary": withOpacity("--tw-color-on-tertiary"),
      },
      borderColor: {
        DEFAULT: "rgb(var(--tw-color-outline-variant) / 0.3)",
      },
      fontFamily: {
        headline: ["var(--font-headline)"],
        body: ["var(--font-body)"],
        label: ["var(--font-label)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius-default)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
    },
  },
};
