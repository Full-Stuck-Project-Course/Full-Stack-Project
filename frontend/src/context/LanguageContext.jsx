// src/context/LanguageContext.jsx
// Hebrew only — no translation needed

import { createContext, useContext } from "react";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const t = (text) => text;

    return (
        <LanguageContext.Provider value={{ lang: "he", t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLang = () => useContext(LanguageContext);
