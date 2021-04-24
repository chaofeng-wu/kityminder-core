define(function(require, exports, module) {
    var data = require('../core/data');
    var LINE_ENDING_SPLITER = /\r\n|\r|\n/;
    var EMPTY_LINE = '';
    var NOTE_MARK_START = '<!--Note-->';
    var NOTE_MARK_CLOSE = '<!--/Note-->';
    var IMAGE_MARK_START = "\x3c!--Image--\x3e";
    var IMAGE_MARK_CLOSE = "\x3c!--/Image--\x3e";
    var lastPrefix = "";

    function encode(json) {
        lastPrefix = "";
        return _build(json).join('\n');
    }

    function _build(node, level) {
        var lines = [];

        var prefix = _getPrefix(node.data.prefix, lastPrefix)
        lines.push(prefix + " " + node.data.text + "\n");

        var note = node.data.note;
        if (note) {
            lines.push(EMPTY_LINE);
            lines.push(NOTE_MARK_START);
            lines.push(note);
            lines.push(NOTE_MARK_CLOSE);
            lines.push(EMPTY_LINE);
        }
        var image = node.data.image;
        if (image) {
            imageTitle = node.data.imageTitle;
            lines.push(EMPTY_LINE);
            lines.push(IMAGE_MARK_START);
            var imageSize = "\x3c!--" + JSON.stringify(node.data.imageSize) + "--\x3e" + "\n";
            lines.push(imageSize);
            var imageURL = "![" + imageTitle + "](" + image + ")" + "\n";
            lines.push(imageURL);
            lines.push(IMAGE_MARK_CLOSE);
            lines.push(EMPTY_LINE);
        }

        if (node.children) node.children.forEach(function(child) {
            lastPrefix = prefix;
            lines = lines.concat(_build(child));
        });

        return lines;
    }

    function _generateHeaderSharp(level) {
        var sharps = '';
        while (level--) sharps += '#';
        return sharps;
    }

    function decode(markdown) {

        var json, parentMap = {}, lines, line, lineInfo, level, node, parent, noteProgress, imageProgress, codeBlock;

        var imageUrl = "";
        // 一级标题转换 `{title}\n===` => `# {title}`
        markdown = markdown.replace(/^(.+)\n={3,}/, function($0, $1) {
            return '# ' + $1;
        });

        lines = markdown.split(LINE_ENDING_SPLITER);

        // 按行分析
        for (var i = 0; i < lines.length; i++) {
            line = lines[i];

            lineInfo = _resolveLine(line);

            if ("*" === lineInfo.prefix || "-" === lineInfo.prefix) {
                if (0 === i){
                    lineInfo.level = 1;
                } else {
                    var previousLineMatch = /^([\t ]*)(\*|\-)\s+(.*)$/.exec(previousNodeLine);
                    if (!previousLineMatch) {
                        lineInfo.level = level + 1;
                    }else{
                        var currentLineMatch = /^([\t ]*)(\*|\-)\s+(.*)$/.exec(line);
                        var previousPrefixLength = previousLineMatch[1].length;
                        var currentPrefixLength = currentLineMatch[1].length;
                        if (previousPrefixLength === currentPrefixLength) {
                            lineInfo.level = level;
                        } else if(previousPrefixLength > currentPrefixLength){
                            lineInfo.level = level - 1;
                        }else{
                            lineInfo.level = level + 1;
                        }
                    }
                }
            }

            var image = "";
            var imageTitle = "";
            if (imageProgress) {
                if (lineInfo.imageClose) {
                    var match = /\!\[(.*)\]\((.+)\)/.exec(imageUrl);
                    if (match) {
                        imageTitle = match[1];
                        image = match[2];
                        node.data.image = image;
                        node.data.imageTitle = imageTitle;
                        imageUrl = "";
                    }
                    var match = /\<!--(.+\}$)-->/.exec(imageUrl);
                    if(match){
                        node.data.imageSize = JSON.parse(match[1]);
                    }else{
                        node.data.imageSize = {
                            width: 200,
                            height: 200
                        };
                    }
                    imageProgress = false;
                }else{
                    imageUrl += line;
                }
                continue;
            } else if (lineInfo.imageStart) {
                imageProgress = true;
                continue;
            }

            // 备注标记处理
            if (lineInfo.noteClose) {
                noteProgress = false;
                continue;
            } else if (lineInfo.noteStart) {
                noteProgress = true;
                continue;
            }

            // 代码块处理
            codeBlock = lineInfo.codeBlock ? !codeBlock : codeBlock;

            // 备注条件：备注标签中，非标题定义，或标题越位
            if (noteProgress || codeBlock || !lineInfo.level) {
                if (node) _pushNote(node, line);
                continue;
            }

            if (lineInfo.level > level + 1) {
                lineInfo.level = level + 1;
            }

            // 标题处理
            level = lineInfo.level;
            previousNodeLine = line;
            node = _initNode(lineInfo.content, lineInfo.fullPrefix, parentMap[level - 1]);
            parentMap[level] = node;
        }

        _cleanUp(parentMap[1]);
        return parentMap[1];
    }

    function _initNode(text, prefix, parent) {
        var node = {
            data: {
                text: text,
                note: "",
                prefix: prefix
            }
        };
        if (parent) {
            if (parent.children) parent.children.push(node);
            else parent.children = [node];
        }
        return node;
    }

    function _getPrefix(curPrefix, lastPrefix){
        if(curPrefix) return curPrefix;
        if(!lastPrefix) return "#";
        if(/\*/.test(lastPrefix)){
            return "\t" + lastPrefix;
        }
        
        if(/#/.test(lastPrefix)){
            if(lastPrefix.length > 5){
                return "*";
            }else{
                return lastPrefix + "#";
            }
        }
    }

    function _pushNote(node, line) {
        node.data.note += line + '\n';
    }

    function _isEmpty(line) {
        return !/\S/.test(line);
    }

    function _resolveLine(line) {
        if ("#" === line[0]) {
            var match = /^(#+)?\s*(.*)$/.exec(line);
            return {
                level: match[1] && match[1].length || null,
                prefix: match[1],
                fullPrefix: match[1],
                content: match[2],
            };
        } else {
            var match = /^([\t ]*(\*|\-))\s+(.*)$/.exec(line);
            if (match){
                return {
                    level: 0,
                    prefix: match[2],
                    fullPrefix: match[1],
                    content: match[3],
                };
            }else{
                return {
                    level: null,
                    prefix: null,
                    content: null,
                    noteStart: line == NOTE_MARK_START,
                    noteClose: line == NOTE_MARK_CLOSE,
                    imageStart: line == IMAGE_MARK_START,
                    imageClose: line == IMAGE_MARK_CLOSE,
                    codeBlock: /^\s*```/.test(line)
                };
            }
        }
    }

    function _cleanUp(node) {
        if (!/\S/.test(node.data.note)) {
            node.data.note = null;
            delete node.data.note;
        } else {
            var notes = node.data.note.split('\n');
            while (notes.length && !/\S/.test(notes[0])) notes.shift();
            while (notes.length && !/\S/.test(notes[notes.length - 1])) notes.pop();
            node.data.note = notes.join('\n');
        }
        if (node.children) node.children.forEach(_cleanUp);
    }

    data.registerProtocol('markdown', module.exports = {
        fileDescription: 'Markdown/GFM 格式',
        fileExtension: '.md',
        mineType: 'text/markdown',
        dataType: 'text',

        encode: function(json) {
            return encode(json.root);
        },

        decode: function(markdown) {
            return decode(markdown);
        }
    });
});