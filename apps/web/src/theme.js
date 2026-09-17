import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#6366f1"
    },
    secondary: {
      main: "#22c55e"
    },
    background: {
      default: "#020617",
      paper: "#0f172a"
    }
  },

  typography: {
    fontFamily: "Inter, sans-serif",
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 }
  },

  shape: {
    borderRadius: 12
  }
});

export default theme;