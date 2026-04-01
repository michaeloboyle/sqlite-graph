#!/usr/bin/env python3
"""
Transform test files from sync to async/await for Database API migration.
"""
import re
import sys
import os

# Methods on db/testDb objects that are now async
ASYNC_DB_METHODS = [
    'createNode', 'getNode', 'updateNode', 'deleteNode',
    'createEdge', 'getEdge', 'deleteEdge',
    'export', 'import', 'close',
    'mergeNode', 'mergeEdge',
    'createPropertyIndex', 'listIndexes', 'dropIndex',
]

# NodeQuery terminal methods (now async)
NODEQUERY_EXEC = ['exec', 'first', 'count', 'exists']

# TraversalQuery terminal methods (now async)
TRAVERSAL_EXEC = ['toArray', 'toPaths', 'shortestPath', 'paths', 'allPaths']


def find_matching_brace(s, start):
    """Find matching } for s[start] == '{'"""
    depth = 0
    i = start
    in_str = None
    esc = False
    while i < len(s):
        c = s[i]
        if esc:
            esc = False
        elif c == '\\' and in_str:
            esc = True
        elif in_str:
            if c == in_str:
                in_str = None
        elif c == '/' and i + 1 < len(s) and s[i+1] == '/':
            # Line comment - skip to end of line
            while i < len(s) and s[i] != '\n':
                i += 1
            continue
        elif c == '/' and i + 1 < len(s) and s[i+1] == '*':
            # Block comment - skip to */
            i += 2
            while i + 1 < len(s) and not (s[i] == '*' and s[i+1] == '/'):
                i += 1
            i += 2
            continue
        elif c in ('"', "'", '`'):
            in_str = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def find_matching_paren(s, start):
    """Find matching ) for s[start] == '('"""
    depth = 0
    i = start
    in_str = None
    esc = False
    while i < len(s):
        c = s[i]
        if esc:
            esc = False
        elif c == '\\' and in_str:
            esc = True
        elif in_str:
            if c == in_str:
                in_str = None
        elif c == '/' and i + 1 < len(s) and s[i+1] == '/':
            # Line comment - skip to end of line
            while i < len(s) and s[i] != '\n':
                i += 1
            continue
        elif c == '/' and i + 1 < len(s) and s[i+1] == '*':
            # Block comment - skip to */
            i += 2
            while i + 1 < len(s) and not (s[i] == '*' and s[i+1] == '/'):
                i += 1
            i += 2
            continue
        elif c in ('"', "'", '`'):
            in_str = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def needs_await_before(s, pos):
    """Check if position pos in string s already has await before it."""
    # Look back up to 15 chars for 'await'
    pre = s[max(0, pos - 15):pos]
    return bool(re.search(r'\bawait\s*$', pre))


def is_inside_expect_call(content, pos):
    """Check if position is directly inside expect(...) as the direct argument (not inside a nested arrow fn)."""
    pre = content[max(0, pos - 80):pos]
    # Check if preceded by expect( (direct arg) or expect(() => (lambda wrapper)
    return bool(re.search(r'expect\s*\(\s*$', pre)) or bool(re.search(r'expect\s*\(\s*\(\s*\)\s*=>\s*$', pre))


def transform_db_methods(content):
    """Add await before db.METHOD() and testDb.METHOD() and ctx calls."""
    # Object names that can have these methods
    obj_re = r'(?:db|testDb|newDb|schemaDb|emptyDb|ctx|db2|db3)'
    
    for method in ASYNC_DB_METHODS:
        pattern = re.compile(r'\b(' + obj_re + r')\.' + re.escape(method) + r'\s*\(')
        result = []
        i = 0
        while i < len(content):
            m = pattern.search(content, i)
            if not m:
                result.append(content[i:])
                break
            if needs_await_before(content, m.start()) or is_inside_expect_call(content, m.start()):
                result.append(content[i:m.end()])
                i = m.end()
                continue
            # Find the end of the method call
            paren_start = m.end() - 1
            paren_end = find_matching_paren(content, paren_start)
            if paren_end == -1:
                result.append(content[i:m.start()])
                result.append('await ' + m.group(0))
                i = m.end()
                continue
            # Check if followed by property access (but not method call)
            after = content[paren_end+1:paren_end+3]
            if re.match(r'\.\w', after) and not re.match(r'\.\w+\s*\(', content[paren_end+1:paren_end+30]):
                # Wrap in parens: (await db.METHOD(...)).property
                call_text = content[m.start():paren_end+1]
                result.append(content[i:m.start()])
                result.append('(await ' + call_text + ')')
                i = paren_end + 1
            else:
                result.append(content[i:m.start()])
                result.append('await ' + m.group(0))
                i = m.end()
        content = ''.join(result)
    
    return content


def make_transaction_callback_async(inner):
    """Make transaction callback async: (ctx) => { -> async (ctx) => {"""
    cb_pattern = re.compile(r'^(\s*)(\([^)]*\))(\s*=>\s*)(\{)')
    cb_match = cb_pattern.match(inner)
    if cb_match and 'async' not in inner[:cb_match.end()]:
        return (inner[:cb_match.start(2)] +
                'async ' + cb_match.group(2) +
                cb_match.group(3) + cb_match.group(4) +
                inner[cb_match.end():])
    return inner


def transform_transaction(content):
    """Transform db.transaction((ctx) => { to await db.transaction(async (ctx) => {"""
    result = []
    i = 0
    # Match db.transaction( with optional TypeScript generics like <Result>
    tx_pattern = re.compile(r'\bdb\.transaction\s*(?:<[^>]*>)?\s*\(')
    
    while i < len(content):
        m = tx_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        if needs_await_before(content, m.start()):
            # Already has await - but still need to make callback async
            paren_start = m.end() - 1
            paren_end = find_matching_paren(content, paren_start)
            if paren_end != -1:
                inner = content[m.end():paren_end]
                inner_new = make_transaction_callback_async(inner)
                result.append(content[i:m.end()])
                result.append(inner_new + content[paren_end])
                i = paren_end + 1
            else:
                result.append(content[i:m.end()])
                i = m.end()
            continue
        
        # Check if this is inside expect(...) - don't add await but still make callback async
        pre = content[max(0, m.start()-60):m.start()]
        inside_expect = bool(re.search(r'expect\s*\(\s*(?:\(\s*\)\s*=>\s*)?$', pre))
        
        # Find the opening paren position
        paren_start = m.end() - 1
        paren_end = find_matching_paren(content, paren_start)
        
        if paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        inner = content[m.end():paren_end]
        inner_new = make_transaction_callback_async(inner)
        
        if inside_expect:
            result.append(content[i:m.start()])
            result.append('db.transaction(' + inner_new + content[paren_end])
        else:
            result.append(content[i:m.start()])
            result.append('await db.transaction(' + inner_new + content[paren_end])
        i = paren_end + 1
    
    return ''.join(result)


def transform_nodequery_exec(content, is_pattern_query=False):
    """Add await before NodeQuery terminal method calls."""
    if is_pattern_query:
        # In PatternQuery test, db.pattern()...exec() stays sync
        # Only db.nodes()...exec() needs await (but PatternQuery test doesn't have these)
        return content
    
    # Pattern: IDENTIFIER.nodes( ... chain ... ).exec()
    # Handles db.nodes(), db2.nodes(), emptyDb.nodes(), etc.
    exec_methods = set(NODEQUERY_EXEC)
    
    result = []
    i = 0
    nodes_pattern = re.compile(r'\b(\w+)\.nodes\s*\(')
    
    while i < len(content):
        m = nodes_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        if needs_await_before(content, m.start()):
            # Already has await, just scan past
            # But we still need to find the end of this chain
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Find the full chain
        chain_start = m.start()
        j = m.end() - 1  # position of '('
        paren_end = find_matching_paren(content, j)
        if paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Now follow the method chain
        k = paren_end + 1
        last_exec_end = -1
        
        while k < len(content):
            # Skip whitespace/newlines
            ws = re.match(r'[ \t\n]*', content[k:])
            k += len(ws.group(0)) if ws else 0
            
            if k >= len(content) or content[k] != '.':
                break
            
            # Try to match method call
            mm = re.match(r'\.(\w+)\s*\(', content[k:])
            if not mm:
                break
            
            method_name = mm.group(1)
            call_paren_pos = k + mm.end() - 1
            call_paren_end = find_matching_paren(content, call_paren_pos)
            
            if call_paren_end == -1:
                break
            
            if method_name in NODEQUERY_EXEC:
                last_exec_end = call_paren_end
            
            k = call_paren_end + 1
        
        if last_exec_end != -1:
            result.append(content[i:chain_start])
            result.append('await ' + content[chain_start:last_exec_end + 1])
            i = last_exec_end + 1
        else:
            result.append(content[i:m.end()])
            i = m.end()
    
    final_content = ''.join(result)
    
    # Second pass: handle standalone variable.exec/first/count/exists() calls
    # e.g., const results = query.exec()  where query = db.nodes(...)
    for method in NODEQUERY_EXEC:
        second_result = []
        j = 0
        method_pattern = re.compile(r'\b(\w+)\.' + method + r'\s*\(\s*\)')
        while j < len(final_content):
            mm = method_pattern.search(final_content, j)
            if not mm:
                second_result.append(final_content[j:])
                break
            if needs_await_before(final_content, mm.start()):
                second_result.append(final_content[j:mm.end()])
                j = mm.end()
                continue
            var_name = mm.group(1)
            # Skip known db chain starters (handled by first pass) and system objects
            skip_vars = {'process', 'fs', 'path', 'require', 'console', 'JSON',
                         'Object', 'Array', 'Math', 'db', 'db2', 'testDb', 'newDb',
                         'schemaDb', 'emptyDb', 'typeof'}
            if var_name in skip_vars:
                second_result.append(final_content[j:mm.end()])
                j = mm.end()
                continue
            second_result.append(final_content[j:mm.start()])
            second_result.append('await ' + mm.group(0))
            j = mm.end()
        final_content = ''.join(second_result)
    
    return final_content


def transform_traversal_exec(content):
    """Add await before TraversalQuery terminal method chains."""
    exec_methods = set(TRAVERSAL_EXEC)
    
    result = []
    i = 0
    traverse_pattern = re.compile(r'\bdb\.traverse\s*\(')
    
    while i < len(content):
        m = traverse_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        if needs_await_before(content, m.start()):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Check if in expect(() => db.traverse(...)) - sync validation, skip
        pre = content[max(0, m.start()-60):m.start()]
        if re.search(r'expect\s*\(\s*\(\s*\)\s*=>\s*$', pre):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        chain_start = m.start()
        j = m.end() - 1
        paren_end = find_matching_paren(content, j)
        if paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        k = paren_end + 1
        last_exec_end = -1
        
        while k < len(content):
            ws = re.match(r'[ \t\n]*', content[k:])
            k += len(ws.group(0)) if ws else 0
            
            if k >= len(content) or content[k] != '.':
                break
            
            mm = re.match(r'\.(\w+)\s*\(', content[k:])
            if not mm:
                break
            
            method_name = mm.group(1)
            call_paren_pos = k + mm.end() - 1
            call_paren_end = find_matching_paren(content, call_paren_pos)
            
            if call_paren_end == -1:
                break
            
            if method_name in exec_methods:
                last_exec_end = call_paren_end
            
            k = call_paren_end + 1
        
        if last_exec_end != -1:
            # Check if there are more method calls after the terminal method
            # (e.g., .toPaths().filter(...)) - if so, wrap in parens
            after_exec = content[last_exec_end+1:last_exec_end+3]
            if re.match(r'\.\w', after_exec):
                result.append(content[i:chain_start])
                result.append('(await ' + content[chain_start:last_exec_end + 1] + ')')
            else:
                result.append(content[i:chain_start])
                result.append('await ' + content[chain_start:last_exec_end + 1])
            i = last_exec_end + 1
        else:
            result.append(content[i:m.end()])
            i = m.end()
    
    return ''.join(result)



def transform_expect_throws(content):
    """Transform expect(() => db.asyncMethod()).toThrow() patterns."""
    sync_only_methods = {'traverse', 'nodes', 'pattern'}
    
    # Pattern: expect(() => db.METHOD(...)).toThrow(...)
    # Also: expect(() => db.transaction(async (ctx) => { ... })).toThrow(...)
    
    result = []
    i = 0
    pattern = re.compile(r'\bexpect\s*\(\s*\(\s*\)\s*=>\s*\{?')
    
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        # Check what comes inside expect(() => ...)
        # We need to determine if the inner function calls an async method
        after_arrow = content[m.end():]
        
        # Find the inner expression
        # Case 1: expect(() => db.method(...)) - no braces
        # Case 2: expect(() => { db.method(...); }) - with braces
        
        matched_end = m.end()
        has_brace = m.group(0).endswith('{')
        
        if has_brace:
            # Find matching }
            brace_start = m.end() - 1
            brace_end = find_matching_brace(content, brace_start)
            if brace_end == -1:
                result.append(content[i:m.end()])
                i = m.end()
                continue
            inner = content[brace_start+1:brace_end]
            after_close = content[brace_end+1:]
            # Find closing ) of expect
            expect_paren_close_match = re.match(r'\s*\)', after_close)
            if not expect_paren_close_match:
                result.append(content[i:m.end()])
                i = m.end()
                continue
            expect_close_end = brace_end + 1 + expect_paren_close_match.end()
        else:
            # No braces - find the ) of expect(
            # The ( of expect( is the first ( in the match
            abs_paren = m.start() + m.group(0).index('(')
            paren_end = find_matching_paren(content, abs_paren)
            if paren_end == -1:
                result.append(content[i:m.end()])
                i = m.end()
                continue
            inner = content[m.end():paren_end]
            expect_close_end = paren_end + 1
            brace_end = None
        
        # Check if inner contains async DB method calls (any db-like variable)
        async_method_re = '|'.join(re.escape(m2) for m2 in ASYNC_DB_METHODS)
        inner_has_async = bool(re.search(r'\b\w+\.(?:' + async_method_re + r')\s*\(', inner))
        inner_has_transaction = bool(re.search(r'\b\w+\.transaction\s*\(', inner))
        
        if not (inner_has_async or inner_has_transaction):
            result.append(content[i:matched_end])
            i = matched_end
            continue
        
        # Now look for .toThrow() after expect(...)
        rest = content[expect_close_end:]
        throw_match = re.match(r'\s*\.\s*toThrow\s*\(', rest)
        if not throw_match:
            result.append(content[i:matched_end])
            i = matched_end
            continue
        
        throw_paren_start = expect_close_end + throw_match.end() - 1
        throw_paren_end = find_matching_paren(content, throw_paren_start)
        if throw_paren_end == -1:
            result.append(content[i:matched_end])
            i = matched_end
            continue
        
        throw_arg = content[throw_paren_start+1:throw_paren_end]
        
        # Build the new expression
        # Extract the actual call from inside expect(() => ...)
        # Remove the () => wrapper
        if has_brace:
            # The inner is a block - extract the db call
            # Find the primary db call in the block
            async_call_m = re.search(r'(?:db\.(?:' + async_method_re + r'|transaction)\s*\()', inner)
            if not async_call_m:
                result.append(content[i:matched_end])
                i = matched_end
                continue
            call_start_in_inner = async_call_m.start()
            # Find the full call
            call_paren = inner.index('(', call_start_in_inner)
            # Actually let's just extract the whole block differently
            # For simplicity, just build: await expect((async () => { INNER })()).rejects.toThrow(ARG)
            # Or better: extract the db.method(...) call
            # Let's find the db.method(...) call in the block
            inner_stripped = inner.strip()
            # Remove leading/trailing whitespace and semicolons
            call_match = re.search(r'(db\.(?:' + '|'.join(re.escape(x) for x in ASYNC_DB_METHODS) + r'|transaction)\s*\()', inner)
            if call_match:
                call_paren_pos_in_inner = inner.index('(', call_match.start())
                call_full_end_in_inner = find_matching_paren(inner, call_paren_pos_in_inner)
                if call_full_end_in_inner != -1:
                    extracted_call = inner[call_match.start():call_full_end_in_inner+1]
                    # Check if the call is db.transaction with async callback
                    if 'transaction' in extracted_call and 'async' in extracted_call:
                        # Keep it as-is
                        pass
                    await_prefix = '' if needs_await_before(content, i) else 'await '
                    new_code = f'{await_prefix}expect({extracted_call}).rejects.toThrow({throw_arg})'
                    result.append(content[i:m.start()])
                    result.append(new_code)
                    i = throw_paren_end + 1
                    continue
        else:
            # inner is the expression like: db.method(args)
            # Strip leading/trailing whitespace
            inner_stripped = inner.strip()
            await_prefix = '' if needs_await_before(content, i) else 'await '
            new_code = f'{await_prefix}expect({inner_stripped}).rejects.toThrow({throw_arg})'
            result.append(content[i:m.start()])
            result.append(new_code)
            i = throw_paren_end + 1
            continue
        
        result.append(content[i:matched_end])
        i = matched_end
    
    return ''.join(result)


def make_callbacks_async(content):
    """Make beforeEach, afterEach, and it() callbacks async where needed."""
    
    def has_async_calls(body):
        # Check if body has any async calls that need await
        # Extended to include testDb., newDb., schemaDb., emptyDb. etc.
        obj_pattern = r'(?:db|testDb|newDb|schemaDb|emptyDb|ctx|db2|db3)'
        async_method_re = r'\b' + obj_pattern + r'\.(?:' + '|'.join(re.escape(m) for m in ASYNC_DB_METHODS) + r')\s*\('
        traversal_re = r'\.(?:toArray|toPaths|shortestPath|paths|allPaths)\s*\('
        tx_re = r'\bdb\.transaction\s*\('
        
        return (bool(re.search(async_method_re, body)) or
                bool(re.search(r'\bdb\.nodes\s*\(', body)) or  # might chain to exec
                bool(re.search(traversal_re, body)) or
                bool(re.search(tx_re, body)))
    
    # Transform beforeEach(() => { to beforeEach(async () => {
    for hook in ['beforeEach', 'afterEach']:
        result = []
        i = 0
        pattern = re.compile(r'\b' + hook + r'\s*\(\s*\(\s*\)\s*=>\s*\{')
        while i < len(content):
            m = pattern.search(content, i)
            if not m:
                result.append(content[i:])
                break
            brace_pos = m.end() - 1
            brace_end = find_matching_brace(content, brace_pos)
            if brace_end == -1:
                result.append(content[i:m.end()])
                i = m.end()
                continue
            body = content[brace_pos+1:brace_end]
            if 'async' in m.group(0):
                result.append(content[i:m.end()])
            elif has_async_calls(body):
                new_hook = m.group(0).replace('() =>', 'async () =>', 1)
                result.append(content[i:m.start()])
                result.append(new_hook)
            else:
                result.append(content[i:m.end()])
            i = m.end()
        content = ''.join(result)
    
    # Transform it('name', () => { to it('name', async () => {
    result = []
    i = 0
    # Match it( or test( with string first arg, then () => {
    it_pattern = re.compile(r'\b(it|test)\s*\(\s*(?:"[^"]*"|\'[^\']*\'|`[^`]*`)\s*,\s*\(\s*\)\s*=>\s*\{')
    while i < len(content):
        m = it_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        brace_pos = m.end() - 1
        brace_end = find_matching_brace(content, brace_pos)
        if brace_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        body = content[brace_pos+1:brace_end]
        if has_async_calls(body):
            new_it = re.sub(r'\(\s*\)\s*=>\s*\{$', 'async () => {', m.group(0))
            result.append(content[i:m.start()])
            result.append(new_it)
        else:
            result.append(content[i:m.end()])
        i = m.end()
    content = ''.join(result)
    
    # Final pass: fix any remaining arrow functions with await inside that aren't async
    # Pattern: (params) => { ... await ... } or identifier => { ... await ... }
    result = []
    i = 0
    # Match both (params) => { and identifier => {
    arrow_block_pattern = re.compile(r'(\([^()]*\)|\b\w+)\s*(=>)\s*\{')
    while i < len(content):
        m = arrow_block_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        pre = content[max(0, m.start()-10):m.start()].rstrip()
        # Skip if already async, or if preceded by ':' (TypeScript return type annotation)
        if pre.endswith('async') or pre.endswith(':') or re.search(r':\s*$', pre):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        # For bare identifier case (not parenthesized), check char before it
        if not m.group(1).startswith('('):
            char_before = content[max(0, m.start()-1):m.start()]
            if char_before in (':', ' ') and re.search(r':\s*\w*$', content[max(0, m.start()-20):m.start()]):
                result.append(content[i:m.end()])
                i = m.end()
                continue
        brace_pos = m.end() - 1
        brace_end = find_matching_brace(content, brace_pos)
        if brace_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        body = content[brace_pos+1:brace_end]
        if re.search(r'\bawait\b', body):
            params = m.group(1)
            result.append(content[i:m.start()])
            result.append(f'async {params} => {{')
            i = m.end()
        else:
            result.append(content[i:m.end()])
            i = m.end()
    content = ''.join(result)
    
    # Fix expression arrow functions with await: (params) => await ... or id => await ...
    result = []
    i = 0
    arrow_expr_pattern = re.compile(r'(\([^()]*\)|\b\w+)\s*=>\s*(await\b)')
    while i < len(content):
        m = arrow_expr_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        pre = content[max(0, m.start()-10):m.start()].rstrip()
        if pre.endswith('async') or pre.endswith(':') or re.search(r':\s*$', pre):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        if not m.group(1).startswith('('):
            if re.search(r':\s*\w*$', content[max(0, m.start()-20):m.start()]):
                result.append(content[i:m.end()])
                i = m.end()
                continue
        params = m.group(1)
        result.append(content[i:m.start()])
        result.append(f'async {params} => await')
        i = m.start() + len(m.group(0))
    content = ''.join(result)
    
    return content


def transform_file(filepath, is_pattern_query=False):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Order matters:
    # 1. Transform expect(() => async).toThrow() first (before adding await)
    content = transform_expect_throws(content)
    
    # 2. Add await to direct db method calls
    content = transform_db_methods(content)
    
    # 3. Transform transaction callbacks
    content = transform_transaction(content)
    
    # 4. Add await to NodeQuery chains
    if not is_pattern_query:
        content = transform_nodequery_exec(content)
    
    # 5. Add await to TraversalQuery chains
    content = transform_traversal_exec(content)
    
    # 6. Make callbacks async
    content = make_callbacks_async(content)
    
    # 7. Wrap Array.from with async callback in Promise.all
    # const X = Array.from({...}, async ...) -> const X = await Promise.all(Array.from({...}, async ...))
    content = re.sub(
        r'(=\s*)(Array\.from\s*\(\s*\{[^}]*\}\s*,\s*async\s)',
        lambda m: '= await Promise.all(' + m.group(2),
        content
    )
    # Close the extra paren - find each Array.from( that we wrapped and add closing )
    # This is handled by finding = await Promise.all(Array.from(...) and adding )
    # Actually, let's do it differently - line by line approach
    # Fix: find lines with "await Promise.all(Array.from" that don't have matching close paren
    
    # Simpler: use regex to wrap complete Array.from(...) calls
    # Reset - redo Array.from wrapping properly
    content = re.sub(
        r'(=\s*await Promise\.all\(Array\.from\s*\()',
        '= await Promise.all(Array.from(',  # undo the above
        content
    )
    # Proper Array.from wrapping:
    result = []
    j = 0
    af_pattern = re.compile(r'((?:const|let|var)\s+\w+\s*=\s*)(Array\.from\s*\()')
    while j < len(content):
        mm = af_pattern.search(content, j)
        if not mm:
            result.append(content[j:])
            break
        # Find the matching ) of Array.from(
        paren_start = mm.start(2) + len('Array.from') 
        paren_start = content.index('(', mm.start(2))
        paren_end = find_matching_paren(content, paren_start)
        if paren_end == -1:
            result.append(content[j:mm.end()])
            j = mm.end()
            continue
        inner = content[mm.end():paren_end]
        # Check if callback is async
        if re.search(r',\s*async\s', inner) and not needs_await_before(content, mm.start(2)):
            result.append(content[j:mm.start(2)])
            result.append('await Promise.all(Array.from(' + inner + '))')
            j = paren_end + 1
        else:
            result.append(content[j:mm.end()])
            j = mm.end()
    content = ''.join(result)
    
    # Wrap .map(async ...) with await Promise.all(...)
    result = []
    j = 0
    map_pattern = re.compile(r'((?:const|let|var)\s+\w+\s*=\s*)(\w+\.map\s*\()')
    while j < len(content):
        mm = map_pattern.search(content, j)
        if not mm:
            result.append(content[j:])
            break
        paren_start = content.index('(', mm.start(2))
        paren_end = find_matching_paren(content, paren_start)
        if paren_end == -1:
            result.append(content[j:mm.end()])
            j = mm.end()
            continue
        inner = content[mm.end():paren_end]
        if re.search(r'^\s*async\s', inner) and not needs_await_before(content, mm.start(2)):
            result.append(content[j:mm.start(2)])
            result.append('await Promise.all(' + mm.group(2)[:-1] + 'map(' + inner + '))')
            j = paren_end + 1
        else:
            result.append(content[j:mm.end()])
            j = mm.end()
    content = ''.join(result)
    
    # Convert .forEach(async ...) to await Promise.all(...map(async ...))
    result = []
    j = 0
    foreach_pattern = re.compile(r'(\w+)\.forEach\s*\(')
    while j < len(content):
        mm = foreach_pattern.search(content, j)
        if not mm:
            result.append(content[j:])
            break
        paren_start = mm.end() - 1
        paren_end = find_matching_paren(content, paren_start)
        if paren_end == -1:
            result.append(content[j:mm.end()])
            j = mm.end()
            continue
        inner = content[mm.end():paren_end]
        if re.search(r'^\s*async\s', inner) and not needs_await_before(content, mm.start()):
            arr = mm.group(1)
            result.append(content[j:mm.start()])
            result.append(f'await Promise.all({arr}.map({inner}))')
            j = paren_end + 1
        else:
            result.append(content[j:mm.end()])
            j = mm.end()
    content = ''.join(result)
    
    return content


if __name__ == '__main__':
    filepath = sys.argv[1]
    is_pattern = 'PatternQuery' in filepath
    result = transform_file(filepath, is_pattern_query=is_pattern)
    with open(filepath, 'w') as f:
        f.write(result)
    print(f"Transformed: {filepath}")
