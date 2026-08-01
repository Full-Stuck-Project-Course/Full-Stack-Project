import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState
} from "react";

const NAVIGATION_EVENT = "carpool:navigation";
const LocationContext = createContext(null);
const ParamsContext = createContext({});

function readLocation() {
    return {
        pathname: window.location.pathname || "/",
        search: window.location.search || "",
        hash: window.location.hash || "",
        state: window.history.state?.usr || null
    };
}

function toHref(to) {
    if (typeof to === "string") return to || "/";
    if (!to) return "/";
    const pathname = to.pathname || window.location.pathname || "/";
    const search = to.search || "";
    const hash = to.hash || "";
    return `${pathname}${search}${hash}`;
}

function notifyNavigation() {
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function navigateTo(to, options = {}) {
    if (typeof to === "number") {
        window.history.go(to);
        return;
    }

    const href = toHref(to);
    const state = { usr: options.state || null };
    if (options.replace) {
        window.history.replaceState(state, "", href);
    } else {
        window.history.pushState(state, "", href);
    }
    notifyNavigation();
}

export function BrowserRouter({ children }) {
    const [location, setLocation] = useState(readLocation);

    useEffect(() => {
        const update = () => setLocation(readLocation());
        window.addEventListener("popstate", update);
        window.addEventListener(NAVIGATION_EVENT, update);
        return () => {
            window.removeEventListener("popstate", update);
            window.removeEventListener(NAVIGATION_EVENT, update);
        };
    }, []);

    return (
        <LocationContext.Provider value={location}>
            {children}
        </LocationContext.Provider>
    );
}

export function useLocation() {
    return useContext(LocationContext) || readLocation();
}

export function useNavigate() {
    return useCallback((to, options) => navigateTo(to, options), []);
}

export function Link({ to, replace = false, state, onClick, target, ...props }) {
    const navigate = useNavigate();
    const href = toHref(to);

    const handleClick = (event) => {
        onClick?.(event);
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            target ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
        ) {
            return;
        }

        event.preventDefault();
        navigate(to, { replace, state });
    };

    return <a href={href} target={target} onClick={handleClick} {...props} />;
}

export function Route() {
    return null;
}

export function Routes({ children }) {
    const location = useLocation();
    const routes = React.Children.toArray(children);

    for (const route of routes) {
        if (!React.isValidElement(route)) continue;
        const params = matchPath(route.props.path, location.pathname);
        if (!params) continue;

        return (
            <ParamsContext.Provider value={params}>
                {route.props.element}
            </ParamsContext.Provider>
        );
    }

    return null;
}

export function Navigate({ to, replace = false, state }) {
    const navigate = useNavigate();

    useEffect(() => {
        navigate(to, { replace, state });
    }, [navigate, replace, state, to]);

    return null;
}

export function useParams() {
    return useContext(ParamsContext);
}

export function useSearchParams() {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const setSearchParams = useCallback((nextInit, options) => {
        const nextParams = new URLSearchParams(
            typeof nextInit === "function" ? nextInit(searchParams) : nextInit
        );
        const query = nextParams.toString();
        navigate(`${location.pathname}${query ? `?${query}` : ""}`, options);
    }, [location.pathname, navigate, searchParams]);

    return [searchParams, setSearchParams];
}

function matchPath(pattern, pathname) {
    if (pattern === "*") return {};
    if (!pattern) return null;
    if (pattern === "/") return pathname === "/" ? {} : null;

    const patternSegments = splitPath(pattern);
    const pathSegments = splitPath(pathname);
    if (patternSegments.length !== pathSegments.length) return null;

    const params = {};
    for (let i = 0; i < patternSegments.length; i += 1) {
        const patternSegment = patternSegments[i];
        const pathSegment = pathSegments[i];

        if (patternSegment.startsWith(":")) {
            params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
            continue;
        }

        if (patternSegment !== pathSegment) return null;
    }

    return params;
}

function splitPath(path) {
    return path.split("?")[0].replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}
