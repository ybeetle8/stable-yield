// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract HelloWorld {
    string private message;
    address public owner;
    
    event MessageChanged(string newMessage, address changedBy);
    
    constructor(string memory _initialMessage) {
        message = _initialMessage;
        owner = msg.sender;
    }
    
    function getMessage() public view returns (string memory) {
        return message;
    }
    
    function setMessage(string memory _newMessage) public {
        message = _newMessage;
        emit MessageChanged(_newMessage, msg.sender);
    }
    
    function getOwner() public view returns (address) {
        return owner;
    }
}