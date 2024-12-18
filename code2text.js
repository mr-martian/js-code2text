// from https://stackoverflow.com/questions/6234773/can-i-escape-html-special-chars-in-javascript
function escape_html(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function maybe_escape(str, html_mode) {
  return html_mode ? escape_html(str) : str;
}

class Capture {
  constructor(nodes, output, list_forms) {
    this.nodes = nodes;
    this.output = output;
    this.list_forms = list_forms || {};
  }
  format(strings, html_mode) {
    let values = {};
    for (let name in this.nodes) {
      if (name == 'root') continue;
      let node = this.nodes[name];
      if (Array.isArray(node)) {
        let j = ' ';
        let mode = null;
        if (this.list_forms.hasOwnProperty(name)) {
          if (html_mode && this.list_forms[name].hasOwnProperty('html_type')) {
            mode = this.list_forms[name].html_type;
            if (mode == 'p') {
              j = '</p><p>';
            } else if (mode == 'ul' || mode == 'ol') {
              j = '</li><li>';
            }
          } else if (this.list_forms[name].hasOwnProperty('join')) {
            j = this.list_forms[name].join;
          }
        }
        values[name] = node.map(n => strings[n.id]).filter(s => typeof s == 'string' && s.length > 0).join(j);
        if (mode == 'ul' || mode == 'ol') {
          values[name] = '<'+mode+'><li>'+values[name]+'</li></'+mode+'>';
        } else if (mode == 'p') {
          values[name] = '<p>'+values[name]+'</p>';
        }
      } else {
        values[name] = strings[node.id];
      }
    }
    let pat = maybe_escape(this.output, html_mode);
    let ret = pat.replace(/{(\w+)}/g, (_, name) => values[name]);
    if (html_mode && ret.length > 0) {
      let root = (this.nodes.hasOwnProperty('root') ? this.nodes.root : this.nodes.root_text);
      ret = '<span class="tree-node" data-id="'+root.id+'">'+ret+'</span>';
    }
    return ret;
  }
  requirements() {
    let ret = [];
    for (let name in this.nodes) {
      let node = this.nodes[name];
      if (Array.isArray(node)) {
        node.forEach(n => ret.push({name: name, node: n}));
      } else {
        ret.push({name: name, node: node});
      }
    }
    return ret;
  }
}

class Pattern {
  constructor(language, query_string, output, ancestor) {
    this.query = language.query(query_string);
    this.output = output;
    this.ancestor = (ancestor ? language.query(ancestor) : ancestor);
  }
  satisfies(cond, dct) {
    for (let c of cond) {
      if (c.hasOwnProperty('has') && !dct.hasOwnProperty(c.has)) {
        return false;
      }
    }
    return true;
  }
  make_capture(dct) {
    if (typeof this.output === 'string') {
      return new Capture(dct, this.output);
    } else {
      for (let option of this.output) {
        if (!option.hasOwnProperty('cond') || this.satisfies(option.cond, dct)) {
          return new Capture(
            dct,
            option.hasOwnProperty('output') ? option.output : '',
            option.hasOwnProperty('lists') ? option.lists : {}
          );
        }
      }
    }
  }
  match_node(root, captures) {
    for (let match of this.query.matches(root)) {
      let cur_root = null;
      let cur = {};
      for (let obj of match.captures) {
        let name = obj.name;
        let node = obj.node;
        if (name == 'root' || name == 'root_text') {
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
      }
      if (cur_root && !captures.hasOwnProperty(cur_root)) {
        captures[cur_root] = this.make_capture(cur);
      }
    }
  }
  match(tree, captures) {
    if (this.ancestor) {
      for (let amatch of this.ancestor.matches(tree.rootNode)) {
        for (let obj of amatch.captures) {
          if (obj.name == 'root') {
            this.match_node(obj.node, captures);
          }
        }
      }
    } else {
      this.match_node(tree.rootNode, captures);
    }
  }
}

function load_patterns(language, blob) {
  return blob.map(obj => new Pattern(language, obj.pattern, obj.output,
                                     obj.ancestor));
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
  return new Capture(dct, pat);
}

function translate(patterns, tree, html_mode) {
  let matches = {};
  patterns.forEach(pat => pat.match(tree, matches));
  let todo = [tree.rootNode];
  let done = {};
  while (todo.length > 0) {
    let cur = todo[todo.length-1];
    if (done.hasOwnProperty(cur.id)) {
      todo.pop();
      continue;
    }
    if (!matches.hasOwnProperty(cur.id)) {
      matches[cur.id] = null_capture(cur);
    }
    let cap = matches[cur.id];
    let incomplete = false;
    let root_text = null;
    cap.requirements().forEach(function(pair) {
      if (pair.name != 'root' && !done.hasOwnProperty(pair.node.id)) {
        if (pair.name == 'root_text') {
          root_text = pair.node;
        } else if (pair.name.endsWith('_text')) {
          done[pair.node.id] = maybe_escape(pair.node.text, html_mode);
        } else {
          todo.push(pair.node);
          incomplete = true;
        }
      }
    });
    if (!incomplete) {
      if (root_text != null) {
        done[root_text.id] = maybe_escape(root_text.text, html_mode);
      }
      todo.pop();
      done[cur.id] = cap.format(done, html_mode);
    }
  }
  return done[tree.rootNode.id];
}
