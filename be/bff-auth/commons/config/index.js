// Lazy re-export of commons config for local bff-auth usage
function _target() { return require('../../commons/config'); }
module.exports = new Proxy({}, {
	get(_, prop) { return _target()[prop]; },
	has(_, prop) { return prop in _target(); },
	ownKeys() { return Object.keys(_target()); },
	getOwnPropertyDescriptor(_, prop) {
		const desc = Object.getOwnPropertyDescriptor(_target(), prop);
		if (desc) return desc;
		return { configurable: true, enumerable: true, value: _target()[prop] };
	}
});
