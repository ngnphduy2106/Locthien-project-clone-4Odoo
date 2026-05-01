// ===============================================
// APP-ROUTER.JS - Module Registration & Navigation
// ===============================================

const AppRouter = {
    modules: {},
    currentModule: null,

    // Register a module with the router
    registerModule(name, module) {
        this.modules[name] = module;
        console.log(`📦 Module registered: ${name}`);
    },

    // Navigate to a module
    navigateTo(name) {
        const module = this.modules[name];
        if (module && typeof module.init === 'function') {
            this.currentModule = name;
            console.log(`🔀 Navigating to: ${name}`);
            try {
                module.init();
            } catch (e) {
                console.error(`❌ Error initializing module ${name}:`, e);
            }
        }
    },

    // Get current module
    getCurrentModule() {
        return this.currentModule;
    },

    // Check if module exists
    hasModule(name) {
        return !!this.modules[name];
    }
};

// === Export to Window ===
window.AppRouter = AppRouter;

console.log('✅ AppRouter loaded');
