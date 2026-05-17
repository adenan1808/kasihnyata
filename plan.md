1. **Create Directory Structure**: Create `js/ui` folder.
2. **Extract `showToast`**: Create `js/ui/toast.js` containing `showToast` logic.
3. **Extract Modals/Tabs/Overlays**: Create `js/ui/tabs.js` (for `showTab`), `js/ui/helpers.js` (for generic helpers).
4. **Update HTML Imports**: Add `<script src="js/ui/toast.js"></script>`, `<script src="js/ui/tabs.js"></script>`, `<script src="js/ui/helpers.js"></script>` to `index.html` above existing scripts.
5. **Modify app.js & admin.js**: Remove `showToast`, `showTab` definitions safely if extracted, keeping `window.showToast = showToast` mapping.
6. **Pre-commit Instructions**: Run the step.
7. **Submit**: Save changes securely.
