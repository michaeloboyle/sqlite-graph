import re
import sys

def transform_file(filepath, is_pattern_query=False):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Step 1: Make beforeEach async if it contains async DB calls
    # Match beforeEach(() => { ... }) blocks
    content = make_hooks_async(content, 'beforeEach', is_pattern_query)
    content = make_hooks_async(content, 'afterEach', is_pattern_query)
    
    # Step 2: Make it() callbacks async if they contain async DB calls
    content = make_it_async(content, is_pattern_query)
    
    # Step 3: Add await to async DB method calls
    content = add_awaits(content, is_pattern_query)
    
    # Step 4: Transform expect(() => asyncMethod()).toThrow() patterns
    content = transform_sync_throws(content)
    
    return content

def has_async_calls(code, is_pattern_query=False):
    """Check if code block contains async DB calls that need await."""
    # Check for DB methods that are now async
    async_patterns = [
        r'\bdb\.createNode\s*\(',
        r'\bdb\.getNode\s*\(',
        r'\bdb\.updateNode\s*\(',
        r'\bdb\.deleteNode\s*\(',
        r'\bdb\.createEdge\s*\(',
        r'\bdb\.getEdge\s*\(',
        r'\bdb\.deleteEdge\s*\(',
        r'\bdb\.transaction\s*\(',
        r'\bdb\.export\s*\(',
        r'\bdb\.import\s*\(',
        r'\bdb\.close\s*\(',
        r'\bdb\.mergeNode\s*\(',
        r'\bdb\.mergeEdge\s*\(',
        r'\bdb\.createPropertyIndex\s*\(',
        r'\bdb\.listIndexes\s*\(',
        r'\bdb\.dropIndex\s*\(',
    ]
    
    # NodeQuery execution methods (not PatternQuery)
    nodequery_patterns = [
        r'\.exec\s*\(\s*\)',
        r'\.first\s*\(\s*\)',
        r'\.count\s*\(\s*\)',
        r'\.exists\s*\(\s*\)',
    ]
    
    traversal_patterns = [
        r'\.toArray\s*\(\s*\)',
        r'\.toPaths\s*\(\s*\)',
        r'\.shortestPath\s*\(',
        r'\.paths\s*\(',
        r'\.allPaths\s*\(',
    ]
    
    for p in async_patterns:
        if re.search(p, code):
            return True
    
    if not is_pattern_query:
        for p in nodequery_patterns:
            if re.search(p, code):
                return True
    else:
        # For PatternQuery, only NodeQuery exec() needs await but they call db.nodes() not db.pattern()
        # Actually in PatternQuery.test.ts, .exec() etc are PatternQuery methods (SYNC)
        # So for PatternQuery file, we don't add await to .exec(), .first(), .count()
        pass
    
    for p in traversal_patterns:
        if re.search(p, code):
            return True
    
    return False

def make_hooks_async(content, hook_name, is_pattern_query=False):
    """Make beforeEach/afterEach async if they contain async calls."""
    # Pattern: beforeEach(() => {  or beforeEach(function() {
    # We need to find the full block
    result = []
    i = 0
    pattern = re.compile(r'\b' + hook_name + r'\s*\(\s*(?:\(\s*\)|function\s*\(\s*\))\s*=>\s*\{')
    
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        result.append(content[i:m.start()])
        
        # Find the matching closing brace
        block_start = m.end() - 1  # position of opening {
        block_end = find_matching_brace(content, block_start)
        
        if block_end == -1:
            result.append(content[m.start():])
            break
        
        block_body = content[block_start+1:block_end]
        
        if has_async_calls(block_body, is_pattern_query):
            # Make it async
            original_match = m.group(0)
            new_match = original_match.replace('() =>', 'async () =>')
            result.append(new_match)
        else:
            result.append(m.group(0))
        
        result.append(content[block_start+1:block_end])
        result.append(content[block_end])
        i = block_end + 1
    
    return ''.join(result)

def make_it_async(content, is_pattern_query=False):
    """Make it() test callbacks async if they contain async calls."""
    result = []
    i = 0
    # Match: it('...', () => { or it("...", () => {
    pattern = re.compile(r'\b(it|test)\s*\(\s*([\'"`].*?[\'"`]|`[^`]*`)\s*,\s*\(\s*\)\s*=>\s*\{', re.DOTALL)
    
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        result.append(content[i:m.start()])
        
        # Find the matching closing brace for the callback
        block_start = m.end() - 1  # position of opening {
        block_end = find_matching_brace(content, block_start)
        
        if block_end == -1:
            result.append(content[m.start():])
            break
        
        block_body = content[block_start+1:block_end]
        
        if has_async_calls(block_body, is_pattern_query):
            # Make it async - replace () => { with async () => {
            new_match = m.group(0)[:-1]  # remove the {
            new_match = new_match.rstrip()
            # Find the () => part and make it async () =>
            new_match = re.sub(r'\(\s*\)\s*=>\s*$', 'async () => ', new_match)
            result.append(new_match + '{')
        else:
            result.append(m.group(0))
        
        result.append(content[block_start+1:block_end])
        result.append(content[block_end])
        i = block_end + 1
    
    return ''.join(result)

def find_matching_brace(content, start):
    """Find the matching closing brace for content[start] which should be '{'."""
    assert content[start] == '{', f"Expected '{{' at position {start}, got '{content[start]}'"
    depth = 0
    i = start
    in_string = None
    escape_next = False
    
    while i < len(content):
        ch = content[i]
        
        if escape_next:
            escape_next = False
            i += 1
            continue
        
        if ch == '\\' and in_string:
            escape_next = True
            i += 1
            continue
        
        if in_string:
            if ch == in_string and (in_string != '`' or True):
                if in_string == '`':
                    in_string = None
                elif in_string in ('"', "'"):
                    in_string = None
            i += 1
            continue
        
        if ch in ('"', "'", '`'):
            in_string = ch
            i += 1
            continue
        
        # Handle template literal ${} expressions - just skip for brace counting
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        
        i += 1
    
    return -1

def add_awaits(content, is_pattern_query=False):
    """Add await to async DB method calls."""
    
    # Methods that need await (not already awaited)
    # We need to be careful not to double-add await
    
    # DB methods that are now async
    async_db_methods = [
        'createNode', 'getNode', 'updateNode', 'deleteNode',
        'createEdge', 'getEdge', 'deleteEdge',
        'export', 'import', 'close',
        'mergeNode', 'mergeEdge',
        'createPropertyIndex', 'listIndexes', 'dropIndex',
    ]
    
    # Add await to db.method() calls that don't already have await
    for method in async_db_methods:
        # Match db.method( not preceded by await
        # Also handle testDb.close(), etc.
        pattern = re.compile(r'(?<!await\s)(?<!await )(\b(?:db|testDb|ctx)\.' + method + r'\s*\()')
        # More carefully: match any identifier.method( where method is in our list
        # Actually let's use a simpler approach: match the pattern and check for preceding await
        content = add_await_to_method(content, method, ['db', 'testDb', 'ctx'])
    
    # transaction needs special handling
    content = add_await_to_transaction(content)
    
    # NodeQuery execution methods (only if not PatternQuery context)
    # We need to add await to .exec(), .first(), .count(), .exists() on NodeQuery chains
    # NodeQuery comes from db.nodes(...)
    if not is_pattern_query:
        content = add_await_to_nodequery_exec(content)
    else:
        # In PatternQuery test, we only add await to db.nodes() chains (not db.pattern() chains)
        content = add_await_to_nodequery_exec_pattern_file(content)
    
    # TraversalQuery execution methods
    content = add_await_to_traversal_exec(content)
    
    return content

def add_await_to_method(content, method, objects):
    """Add await to obj.method() calls."""
    obj_pattern = '|'.join(re.escape(o) for o in objects)
    # Match: (no await before) obj.method(
    # The tricky part is "no await before" - check if 'await ' precedes it
    
    pattern = re.compile(
        r'(?<!\bawait\s)(?<!\bawait  )(?<!\bawait   )'  # not preceded by await
        r'(\b(?:' + obj_pattern + r')\.' + re.escape(method) + r'\s*\()'
    )
    
    # Use a different approach - find all occurrences and check preceding context
    result = []
    i = 0
    simple_pattern = re.compile(r'\b(?:' + obj_pattern + r')\.' + re.escape(method) + r'\s*\(')
    
    while i < len(content):
        m = simple_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        # Check if 'await ' precedes this match (with possible spaces)
        prefix = content[max(0, m.start()-10):m.start()]
        if re.search(r'\bawait\s*$', prefix):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Check if we're inside a string or comment
        # Simple heuristic: count quotes before this position
        
        result.append(content[i:m.start()])
        result.append('await ' + m.group(0))
        i = m.end()
    
    return ''.join(result)

def add_await_to_transaction(content):
    """Add await to db.transaction( calls."""
    # First, transform the transaction callback to async
    # db.transaction((ctx) => {  =>  await db.transaction(async (ctx) => {
    # db.transaction(() => {  =>  await db.transaction(async () => {
    
    # Handle: expect(() => db.transaction(...)).toThrow() - these get transformed separately
    # Here we handle: db.transaction( or const x = db.transaction(
    
    result = []
    i = 0
    pattern = re.compile(r'\bdb\.transaction\s*\(')
    
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        # Check if await already precedes
        prefix = content[max(0, m.start()-10):m.start()]
        if re.search(r'\bawait\s*$', prefix):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Check if this is inside expect(() => ...) - don't add await here
        # Look back further for expect(
        # Actually the expect transform happens in transform_sync_throws
        # We need to skip if this db.transaction is inside an arrow function argument to expect
        prefix_long = content[max(0, m.start()-50):m.start()]
        if re.search(r'expect\s*\(\s*\(\s*\)\s*=>\s*$', prefix_long):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        result.append(content[i:m.start()])
        result.append('await ' + m.group(0))
        i = m.end()
    
    return ''.join(result)

def add_await_to_nodequery_exec(content):
    """Add await to .exec(), .first(), .count(), .exists() on NodeQuery chains."""
    # These come after db.nodes(...) chains
    # Pattern: something).exec() or something).first() etc.
    # We add await if not already there
    
    methods = ['exec', 'first', 'count', 'exists']
    
    for method in methods:
        result = []
        i = 0
        pattern = re.compile(r'\)\s*\.\s*' + method + r'\s*\(\s*\)')
        
        while i < len(content):
            m = pattern.search(content, i)
            if not m:
                result.append(content[i:])
                break
            
            # Check if await precedes the chain
            # We need to look back to find the start of the chain
            prefix = content[max(0, m.start()-200):m.start()]
            
            # Check if this is a PatternQuery call (db.pattern()...)
            # If the chain contains db.pattern(), skip
            # Find the chain start - look back for db.nodes( or db.pattern(
            chain_context = content[max(0, m.start()-300):m.end()]
            
            # Check if it's already awaited by looking at prefix more carefully
            # The await would be somewhere before the start of the chain
            # This is complex - let's look for 'await' keyword before the nearest assignment or statement start
            
            # Check if preceded by await (looking at immediate area)
            before_match = content[max(0, m.start()-5):m.start()]
            
            # Let's check the full statement for await
            # Find statement start
            stmt_start = find_statement_start(content, m.start())
            stmt_prefix = content[stmt_start:m.start()]
            
            if 'await' in stmt_prefix and not re.search(r'\bawait\b.*\bawait\b', stmt_prefix):
                # Already has await in this statement
                result.append(content[i:m.end()])
                i = m.end()
                continue
            
            result.append(content[i:m.start()])
            result.append(m.group(0))  # will add await before chain start
            i = m.end()
        
        content = ''.join(result)
    
    # Better approach: find db.nodes(...) chains and add await before them
    content = add_await_before_nodequery_chain(content)
    
    return content

def add_await_to_nodequery_exec_pattern_file(content):
    """For PatternQuery test file - only add await to db.nodes() chains, not db.pattern() chains."""
    # Same as above but skip db.pattern() chains
    content = add_await_before_nodequery_chain(content, skip_pattern=True)
    return content

def add_await_before_nodequery_chain(content, skip_pattern=False):
    """Add await before db.nodes(...).....exec() chains."""
    result = []
    i = 0
    
    # Find db.nodes( chains that end with .exec(), .first(), .count(), .exists()
    # We need to find the full chain
    db_nodes_pattern = re.compile(r'\bdb\.nodes\s*\(')
    
    while i < len(content):
        m = db_nodes_pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        # Check if await already precedes
        prefix = content[max(0, m.start()-10):m.start()]
        if re.search(r'\bawait\s*$', prefix):
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Now find if this chain ends with an exec method
        # Find the full chain by scanning forward
        # First find the closing paren of db.nodes(...)
        paren_end = find_matching_paren(content, m.end() - 1)
        if paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Now scan forward through chained method calls
        j = paren_end + 1
        chain_end = paren_end
        last_exec_end = -1
        
        while j < len(content):
            # Skip whitespace and newlines
            ws = re.match(r'[\s]*', content[j:])
            j += len(ws.group(0)) if ws else 0
            
            if j >= len(content) or content[j] != '.':
                break
            
            # Check for method call
            method_match = re.match(r'\.\s*(\w+)\s*\(', content[j:])
            if not method_match:
                break
            
            method_name = method_match.group(1)
            call_start = j + method_match.start(0)
            paren_start = j + method_match.end(0) - 1
            paren_close = find_matching_paren(content, paren_start)
            
            if paren_close == -1:
                break
            
            chain_end = paren_close
            
            if method_name in ('exec', 'first', 'count', 'exists'):
                last_exec_end = paren_close
            
            j = paren_close + 1
        
        if last_exec_end != -1:
            # This chain ends with an exec method - add await before db.nodes(
            result.append(content[i:m.start()])
            result.append('await ' + content[m.start():last_exec_end+1])
            i = last_exec_end + 1
        else:
            result.append(content[i:m.end()])
            i = m.end()
    
    return content  # Return original - this approach is too complex, use simpler regex

def find_statement_start(content, pos):
    """Find the start of the statement containing pos."""
    # Look back for newline, semicolon, or opening brace
    i = pos - 1
    while i >= 0:
        ch = content[i]
        if ch in (';\n', '\n', '{'):
            return i + 1
        if ch == ';':
            return i + 1
        i -= 1
    return 0

def find_matching_paren(content, start):
    """Find matching ) for content[start] which should be '('."""
    if start >= len(content) or content[start] != '(':
        return -1
    depth = 0
    i = start
    in_string = None
    escape_next = False
    
    while i < len(content):
        ch = content[i]
        
        if escape_next:
            escape_next = False
            i += 1
            continue
        
        if ch == '\\' and in_string:
            escape_next = True
            i += 1
            continue
        
        if in_string:
            if ch == in_string:
                in_string = None
            i += 1
            continue
        
        if ch in ('"', "'", '`'):
            in_string = ch
            i += 1
            continue
        
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return i
        
        i += 1
    
    return -1

def add_await_to_traversal_exec(content):
    """Add await to traversal execution methods."""
    methods = ['toArray', 'toPaths', 'shortestPath', 'paths', 'allPaths']
    
    for method in methods:
        result = []
        i = 0
        pattern = re.compile(r'\)\s*\.\s*' + method + r'\s*\(')
        
        while i < len(content):
            m = pattern.search(content, i)
            if not m:
                result.append(content[i:])
                break
            
            # Check if stmt already has await
            stmt_start = find_statement_start(content, m.start())
            stmt_prefix = content[stmt_start:m.start()]
            
            if re.search(r'\bawait\b', stmt_prefix):
                result.append(content[i:m.end()])
                i = m.end()
                continue
            
            result.append(content[i:m.end()])
            i = m.end()
        
        content = ''.join(result)
    
    return content

def transform_sync_throws(content):
    """Transform expect(() => asyncMethod()).toThrow() to await expect(asyncMethod()).rejects.toThrow()."""
    # Pattern: expect(() => db.method(...)).toThrow(...)
    # becomes: await expect(db.method(...)).rejects.toThrow(...)
    
    # Also handle: expect(() => db.transaction(...)).toThrow(...)
    
    result = []
    i = 0
    pattern = re.compile(r'expect\s*\(\s*\(\s*\)\s*=>\s*(db\.\w+\s*\()')
    
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        
        # Get the method name
        method_call_start = m.start(1)
        method_name_match = re.match(r'db\.(\w+)', m.group(1))
        if not method_name_match:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        method_name = method_name_match.group(1)
        
        # Check if this is an async method (not traverse which is sync)
        sync_methods = {'traverse', 'nodes', 'pattern'}
        if method_name in sync_methods:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Find the full inner expression: db.method(...)
        paren_start = m.start(1) + len(m.group(1)) - 1
        paren_end = find_matching_paren(content, paren_start)
        if paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        inner_expr = content[m.start(1):paren_end+1]
        
        # Now find the closing ) of expect(...)
        # The expect( opens, then () => db.method(...) is the arg
        # expect_paren_start is at expect(
        expect_paren_pos = m.start() + m.group(0).index('(')
        # Find matching ) for this expect(
        # But first we need to handle: the content inside expect is (() => db.method(...))
        # The closing ) of expect is right after paren_end
        after_inner = content[paren_end+1:]
        close_match = re.match(r'\s*\)', after_inner)
        if not close_match:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        after_expect_close = paren_end + 1 + close_match.end()
        
        # Now look for .toThrow(...) or .not.toThrow() etc.
        rest = content[after_expect_close:]
        throws_match = re.match(r'\s*\.\s*toThrow\s*\(', rest)
        if not throws_match:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        # Find the closing ) of toThrow(...)
        throws_paren_start = after_expect_close + throws_match.end() - 1
        throws_paren_end = find_matching_paren(content, throws_paren_start)
        if throws_paren_end == -1:
            result.append(content[i:m.end()])
            i = m.end()
            continue
        
        throw_arg = content[throws_paren_start+1:throws_paren_end]
        
        # Check if 'await' already precedes expect
        prefix = content[max(0, m.start()-10):m.start()]
        has_await = re.search(r'\bawait\s*$', prefix)
        
        await_prefix = '' if has_await else 'await '
        
        new_code = f'{await_prefix}expect({inner_expr}).rejects.toThrow({throw_arg})'
        
        result.append(content[i:m.start()])
        result.append(new_code)
        i = throws_paren_end + 1
    
    return ''.join(result)


# Main transformation - use a simpler line-by-line approach with context
def transform_content(content, is_pattern_query=False, is_transaction=False, is_traversal=False):
    """Main transformation function using regex substitution."""
    
    lines = content.split('\n')
    result_lines = []
    
    # Track if we're inside async contexts
    # Process line by line is too simple for our needs
    # Let's use the full content approach
    
    return content


# Simpler approach using targeted regex replacements

ASYNC_DB_METHODS = [
    'createNode', 'getNode', 'updateNode', 'deleteNode',
    'createEdge', 'getEdge', 'deleteEdge',
    'export', 'import', 'close',
    'mergeNode', 'mergeEdge',
    'createPropertyIndex', 'listIndexes', 'dropIndex',
]

NODEQUERY_EXEC_METHODS = ['exec', 'first', 'count', 'exists']
TRAVERSAL_EXEC_METHODS = ['toArray', 'toPaths', 'shortestPath', 'paths', 'allPaths']


def simple_transform(content, is_pattern_query=False):
    """Apply simple regex transformations."""
    
    # 1. Transform expect(() => db.asyncMethod()).toThrow() patterns FIRST
    # because this changes what we should await
    
    # Pattern: expect(() => db.METHOD(...)).toThrow(...)
    # Async methods that need this transformation:
    async_methods_for_throw = '|'.join(ASYNC_DB_METHODS)
    
    # Handle: expect(() => db.transaction(async? (...) => {...})).toThrow(...)
    # This is complex - let's handle transaction separately
    
    # Simple pattern for: expect(() => db.METHOD(...)).toThrow(MSG)
    # where METHOD is in ASYNC_DB_METHODS (not traverse/nodes/pattern)
    def replace_sync_throw(m):
        prefix_check = content[max(0, m.start()-10):m.start()]
        full_match = m.group(0)
        method = m.group(1)
        inner_args = m.group(2)
        throw_msg = m.group(3)
        
        await_prefix = 'await ' if not re.search(r'\bawait\s*$', prefix_check) else ''
        return f"{await_prefix}expect(db.{method}({inner_args})).rejects.toThrow({throw_msg})"
    
    # This is getting complex. Let me use a different approach.
    # Let's write the transformation as a series of simple find-and-replace patterns
    # that we can verify work for specific cases.
    
    return content


if __name__ == '__main__':
    filepath = sys.argv[1]
    is_pattern = 'PatternQuery' in filepath
    result = transform_file(filepath, is_pattern_query=is_pattern)
    print(result, end='')

