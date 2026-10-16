// Classes the agent uses, found by name (and namespace) during start-up discovery.
// To support a new FM control: add its class here, then teach ui-tree/ui-actions about it.
const CLASSES = {
  'UnityEngine.UIElements': ['VisualElement', 'Button', 'Clickable', 'Panel', 'UIElementsRuntimeUtility', 'TextElement',
    'TextField', 'LongField', 'IntegerField', 'Toggle', 'NavigationSubmitEvent', 'MouseEnterEvent', 'ScrollView', 'Scroller'],
  'UnityEngine': ['Application'],
  'UnityEngine.InputSystem': ['InputSystem'],
  'UnityEngine.InputSystem.LowLevel': ['StateEvent'],
  // FM (Sports Interactive) UI classes; namespaces vary, so these match by name only.
  '*': ['PluginContextMenuBindings', 'ContextMenuDescriptionManipulator', 'NavigatableVisualElement', 'FMCombobox',
    'SIDropdown', 'SIRadioButton', 'EntryElement', 'DropdownRowNavigatable', 'StreamedDropdownList', 'SIClickable', 'SILongField', 'BaseCardTemplateImpl'],
};
const classes = new Map();          // name → class pointer
const classMetadata = [];           // for `uimetadata` (development)
function registerClass(c, name, ns) {
  const wanted = (CLASSES[ns] || []).includes(name) || CLASSES['*'].includes(name);
  if (!wanted || classes.has(name)) return;
  classes.set(name, c);
  classMetadata.push({name, ns, parent: className(A.parent(c)),
    fields: fieldList(c).map(f => ({name: f.name, type: f.type, offset: f.offset})),
    methods: methodList(c).map(m => ({name: m.name, parameters: m.parameters, returns: m.returns}))});
}
const cls = name => { const c = classes.get(name); if (!c) throw Error('Class not discovered: ' + name); return c; };
