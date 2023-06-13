class Capture {
  constructor(nodes, output, list_forms) {
    this.nodes = nodes;
    this.output = output;
    this.list_forms = list_forms || {};
  }
  format(strings) {
    let values = {};
    for (let name of this.nodes) {
      if (name == 'root') continue;
      let node = this.nodes[name];
      if (Array.isArray(node)) {
        let j = ' ';
        if (this.list_forms.hasOwnProperty(name) &&
            this.list_forms[name].hasOwnProperty('join')) {
          j = this.list_forms[name].join;
        }
        values[name] = node.map(n => strings[n.id]).join(j);
      } else {
        values[name] = strings[node.id];
      }
    }
    this.output.replace(/{(\w+)}/g, (_, name) => values[name]);
  }
  requirements() {
    let ret = [];
    for (let name of this.nodes) {
      let node = this.nodes[name];
      if (Array.isArray(node)) {
        node.forEach(n => ret.push({name: name, node: n}));
      } else {
        ret.push({name: name, node: n});
      }
    }
    return ret;
  }
}

class Pattern {
  constructor(language, query_string, output) {
    this.query = language.query(query_string);
    this.output = output;
  }
  satisfies(cond, dct) {
    for (let c in cond) {
      if (c.hasOwnProperty('has') && !dct.hasOwnProperty(c.has)) {
        return false;
      }
    }
    return true;
  }
  make_capture(dct) {
    if (typeof this.output === 'string') {
      return Capture(dct, this.output);
    } else {
      for (let option in this.output) {
        if (!option.hasOwnProperty('cond') || this.satisfies(option.cond)) {
          return Capture(
            dct,
            option.hasOwnProperty('output') ? option.output : '',
            option.hasOwnProperty('lists') ? option.lists : {}
          );
        }
      }
    }
  }
  match(tree, captures) {
    let cur_empty = true;
    let cur_root = null;
    let cur = {};
    let seen_roots = new Set();
    for (let obj in this.query.captures(tree.rootNode)) {
      let name = obj.name;
      let node = obj.node;
      if (name == 'root' || name == 'root_text') {
        if (!seen_roots.has(node.id)) {
          if (!cur_empty && !captures.hasOwnProperty(cur_root)) {
            captures[cur_root] = this.make_capture(cur);
          }
          seen_roots.add(node.id);
          cur = {};
          cur_empty = true;
        }
        cur_root = node.id;
      }
      if (name.endsWith('_list')) {
        if (!cur.hasOwnProperty(name)) {
          cur[name] = [];
        }
        cur[name].push(node);
      } else {
        cur[name] = node;
      }
      cur_empty = false;
    }
    if (!cur_empty && !captures.hasOwnProperty(cur_root)) {
      captures[cur_root] = this.make_capture(cur);
    }
  }
}

function load_patterns(language, blob) {
  return blob.map(obj => Pattern(language, obj.pattern, obj.output));
}

function null_capture(node) {
  let dct = {root: node};
  let ls = [node.type];
  for (let i = 0; i < node.children.length; i++) {
    let n = 'ch'+i;
    ls.push('{'+n+'}');
    dct[n] = node.children[i];
  }
  pat = '(' + ls.join(' ') + ')';
  return Capture(dct, pat);
}

function translate(patterns, tree) {
  let matches = {};
  patterns.forEach(pat => pat.match(tree, matches));
  let todo = [tree.rootNode];
  let done = {};
  while (todo.length > 0) {
    let cur = ls[ls.length-1];
    if (done.hasOwnProperty(cur.id)) {
      todo.pop();
      continue;
    }
    if (!matches.hasOwnProperty(cur.id)) {
      matches[cur.id] = null_capture(cur);
    }
    let cap = matches[cur.id];
    let incomplete = false;
    cap.requirements().forEach(function(pair) {
      if (pair.name != 'root' && !done.hasOwnProperty(pair.node.id)) {
        if (pair.name.endsWith('_text')) {
          done[pair.node.id] = pair.node.text;
        } else {
          todo.push(pair.node);
          incomplete = true;
        }
      }
    });
    if (!incomplete) {
      todo.pop();
      done[cur.id] = cap.format(done);
    }
  }
  return done[tree.rootNode.id];
}