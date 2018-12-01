# CJC
JSON for ES6, functional objects/classes and the bits JSON forgot

## JSON is not fit for anything but very simple data
Good luck using JSON to store functional Javascript objects!  Functions (methods) are stripped-out, dates and regexs break, and it can't deal with recursion.  **These are basics required for proper OO programming.**  Do you want your container class to have an array of component objects which point back to the container?  That's pretty standard in OO but a no-no for JSON.

CJC fixes that so you can store your objects persistently and of course rebuild them from whatever storage you used.  For example a configuration-settings object can be stringified and shoved into localStorage...  But without CJC it can't have a method to display everything nicely in HTML say, or a method to validate inputs.  

## CJC is easy to use
* Replace JSON.stringify() with CJC.ToJ() or CJC.toJSON()
* Replace JSON.parse() with CJC.FromJ() or CJC.fromJSON()
* Add CJC.RegisterConstructors(ArrayOfConstructors) after the class definitions

(There are a couple of other things you should be aware of, but basically that's it.)

# Website
Go to http://vulpeculox.net/misc/jsjq/CJC/index.htm for the a choice of downloads, get started and reference.

# Development
There's a developers download which contains tests and a more detailed API.  I'm sure this needs more thorough testing and so collaboration is very welcome.

# Example
The following code will fail when stringified-parsed using JSON due to recursion.  With CJC you'd ToJ(myToolBox) and there's your string to do whatever you like with.  Later you can CJC.FromJ(stringFromStore) and Bob's your uncle!

```javascript
// TOOLS IN TOOLBOX POINT TO TOOLBOX
//==================================
class Ctool{
  constructor(Name){
    this.name = Name;
    this.container = 'not set yet';
  }
  get owner(){
    return this.container.owner || "don't know";
  }
}

class Cbox{
  constructor(Owner){
    this.owner=Owner;
    this.tools = [];
    this.padlock = new Ctool('Padlock');  // connected straight
    this.padlock.container = this;
  }
  AddTool(Name){
    var t = new Ctool(Name);
    t.container = this;
    this.tools.push(t);
  }
  get doesEverythingBelongToMe(){
    var singleOk = (this.padlock.owner == this.owner);
    var arrayOk  = this.tools.every(function(T){return T.owner==this.owner;},this);
    return 'Single:'+singleOk+'  Array:'+arrayOk;
  }
  get isAllNull(){
    var singleOk = (this.padlock.owner == null);
    var arrayOk  = this.tools.every(function(T){return T.owner==null;},this);
    return 'Single:'+singleOk+'  Array:'+arrayOk;
  }
  get myTools(){
    return this.tools.map(T=>T.name).sort();
 }  
}

CJC.RegisterConstructors([Ctool,Cbox]);
```




Peter Fox,  1 December 2018
